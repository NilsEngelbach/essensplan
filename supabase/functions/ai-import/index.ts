import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import OpenAI from 'jsr:@openai/openai@^5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to parse recipe from URL using GPT-5
async function parseRecipeFromURL(openai: OpenAI, url: string): Promise<string> {
  const response = await openai.responses.create({
    model: 'gpt-5',
    tools: [
      { type: "web_search_preview" },
    ],
    input: `
      Du bist ein Experte für Rezepte. Extrahiere strukturierte Rezeptdaten von Webseiten.
      Gib die Antwort IMMER als gültiges JSON zurück mit der Struktur:
      {
        "title": "Rezepttitel",
        "description": "Kurze Beschreibung",
        "category": "Hauptspeise/Salat/Dessert/Suppe/Beilage/Frühstück/Snack",
        "tags": ["vegetarisch", "vegan", "glutenfrei", "schnell", "gesund", etc],
        "cookingTime": 30,
        "servings": 4,
        "difficulty": "Einfach/Mittel/Schwer",
        "sourceUrl": "${url}",
        "imageUrl": "https://example.com/image.jpg",
        "ingredients": [
          {"name": "Zutat", "amount": 100, "unit": "g", "notes": "optional", "component": "optional component like Teig/Füllung"}
        ],
        "instructions": [
          {"stepNumber": 1, "description": "Schritt 1"}
        ]
      }
      Besuche diese URL und extrahiere das Rezept: ${url}.
      Gib nur das JSON zurück, keine zusätzlichen Erklärungen.
    `
  })
  
  console.log('OpenAI response:', response.output_text)

  return response.output_text
}

// Function to analyze recipe from image using GPT-5 with Vision
async function analyzeRecipeFromImage(openai: OpenAI, imageContent: string): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `Du bist ein Experte für Rezepte. Analysiere Bilder und extrahiere strukturierte Rezeptdaten.
      Gib die Antwort IMMER als gültiges JSON zurück mit der Struktur:
      {
        "title": "Rezepttitel",
        "description": "Kurze Beschreibung",
        "category": "Hauptspeise/Salat/Dessert/Suppe/Beilage/Frühstück/Snack",
        "tags": ["vegetarisch", "vegan", "glutenfrei", "schnell", "gesund", etc],
        "cookingTime": 30,
        "servings": 4,
        "difficulty": "Einfach/Mittel/Schwer",
        "imageData": "base64-encoded-image-data",
        "ingredients": [
          {"name": "Zutat", "amount": 100, "unit": "g", "notes": "optional", "component": "optional component like Teig/Füllung"}
        ],
        "instructions": [
          {"stepNumber": 1, "description": "Schritt 1"}
        ]
      }
      
      Wichtige Hinweise:
      - Erkenne Zutaten und Mengenangaben genau
      - Schätze Kochzeit und Portionen realistisch ein
      - Gib sinnvolle deutsche Tags an
      - Erstelle klare, schrittweise Anweisungen
      - Falls das Bild kein Rezept enthält, gib einen Fehler zurück`
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Analysiere dieses Bild und extrahiere das Rezept. Wenn es sich um ein handgeschriebenes Rezept, einen Screenshot oder ein Foto eines Rezepts handelt, lies alle Details sorgfältig ab. Gib nur das JSON zurück, keine zusätzlichen Erklärungen.'
        },
        {
          type: 'image_url',
          image_url: {
            url: imageContent,
            detail: 'high'
          }
        }
      ]
    }
  ]
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-5',
    messages,
    temperature: 0.2,
    max_tokens: 4000,
    response_format: { type: 'json_object' }
  })
  
  return completion.choices[0]?.message?.content || ''
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!authHeader || !token) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) {
      console.log(authError || 'User not found');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse request body
    const { type, content } = await req.json()

    if (!type || !content) {
      return new Response(
        JSON.stringify({ error: 'Type and content are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get OpenAI API key from environment
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    })

    let response: string

    // Route to appropriate handler based on import type
    switch (type) {
      case 'url':
        console.log('Processing URL import:', content)
        response = await parseRecipeFromURL(openai, content)
        break

      case 'screenshot':
        console.log('Processing image import, image size:', content.length)
        response = await analyzeRecipeFromImage(openai, content)
        break

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid import type. Supported types: url, screenshot' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
    }

    if (!response) {
      throw new Error('No response from OpenAI')
    }

    console.log('OpenAI response:', response)

    // Try to parse JSON response
    let recipe
    try {
      recipe = JSON.parse(response)
    } catch (error) {
      // If JSON parsing fails, try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        recipe = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse recipe data')
      }
    }

    return new Response(
      JSON.stringify(recipe),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('AI import error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Failed to import recipe',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})