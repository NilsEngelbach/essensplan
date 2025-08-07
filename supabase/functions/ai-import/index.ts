import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { 
        global: { 
          headers: { Authorization: authHeader } 
        } 
      }
    )

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
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

    let prompt = ''

    switch (type) {
      case 'url':
        prompt = `Extrahiere ein Rezept aus der folgenden URL. Gib die Antwort als JSON zurück mit der Struktur:
        {
          "title": "Rezepttitel",
          "description": "Kurze Beschreibung",
          "category": "Hauptspeise/Salat/Dessert/etc",
          "tags": ["vegetarisch", "vegan", "schnell", etc],
          "cookingTime": 30,
          "servings": 4,
          "difficulty": "Einfach/Mittel/Schwer",
          "ingredients": [
            {"name": "Zutat", "amount": 100, "unit": "g", "notes": "optional", "component": "optional component like Teig/Füllung"}
          ],
          "instructions": [
            {"stepNumber": 1, "description": "Schritt 1"}
          ]
        }
        
        URL: ${content}`
        break

      case 'text':
        prompt = `Extrahiere ein Rezept aus dem folgenden Text. Gib die Antwort als JSON zurück mit der Struktur:
        {
          "title": "Rezepttitel",
          "description": "Kurze Beschreibung",
          "category": "Hauptspeise/Salat/Dessert/etc",
          "tags": ["vegetarisch", "vegan", "schnell", etc],
          "cookingTime": 30,
          "servings": 4,
          "difficulty": "Einfach/Mittel/Schwer",
          "ingredients": [
            {"name": "Zutat", "amount": 100, "unit": "g", "notes": "optional", "component": "optional component like Teig/Füllung"}
          ],
          "instructions": [
            {"stepNumber": 1, "description": "Schritt 1"}
          ]
        }
        
        Text: ${content}`
        break

      case 'screenshot':
        prompt = `Analysiere das folgende Bild und extrahiere ein Rezept. Gib die Antwort als JSON zurück mit der Struktur:
        {
          "title": "Rezepttitel",
          "description": "Kurze Beschreibung",
          "category": "Hauptspeise/Salat/Dessert/etc",
          "tags": ["vegetarisch", "vegan", "schnell", etc],
          "cookingTime": 30,
          "servings": 4,
          "difficulty": "Einfach/Mittel/Schwer",
          "ingredients": [
            {"name": "Zutat", "amount": 100, "unit": "g", "notes": "optional", "component": "optional component like Teig/Füllung"}
          ],
          "instructions": [
            {"stepNumber": 1, "description": "Schritt 1"}
          ]
        }
        
        Bildinhalt: ${content}`
        break

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid import type' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
    }

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Du bist ein Experte für Rezepte. Extrahiere strukturierte Rezeptdaten aus verschiedenen Quellen.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    })

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.statusText}`)
    }

    const openaiData = await openaiResponse.json()
    const response = openaiData.choices[0]?.message?.content

    if (!response) {
      throw new Error('No response from OpenAI')
    }

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