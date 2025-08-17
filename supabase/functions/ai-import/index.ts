import { createClient } from "supabase"
import OpenAI from "openai";
import { z } from "zod"
import { zodTextFormat } from "npm:openai/helpers/zod";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const Recipe = z.object({
  title: z.string(),
  description: z.string(),
  category: z.enum(['Hauptspeise', 'Salat', 'Dessert', 'Suppe', 'Beilage', 'Frühstück', 'Snack']),
  tags: z.array(z.enum(['Vegetarisch', 'Vegan', 'Glutenfrei', 'Laktosefrei', 'Schnell', 'Gesund', 'Würzig', 'Süß'])),
  cookingTime: z.number().int(),
  servings: z.number().int(),
  difficulty: z.enum(['Einfach', 'Mittel', 'Schwer']),
  imageUrl: z.string().nullable().optional(), // Optional image URL
  sourceUrl: z.string().nullable().optional(), // Optional source URL
  ingredients: z.array(
    z.object({
      name: z.string(),
      amount: z.number().int().min(0),
      unit: z.string().nullable(),  // e.g. 'g', 'ml', 'Tasse'
      notes: z.string().nullable(), // e.g. 'optional', 'nach Geschmack'
      component: z.string().nullable(), // e.g. 'Teig', 'Füllung'
    })
  ),
  instructions: z.array(
    z.object({
      stepNumber: z.number().int().min(1),
      description: z.string(),
    })
  ),
});

type RecipeType = z.infer<typeof Recipe>;

// Helper function to fetch image and convert to base64
async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    console.log('Fetching image from URL:', imageUrl);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn('Failed to fetch image:', response.status, response.statusText);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    // Get content type from response headers
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Error fetching image:', error);
    return null;
  }
}

async function parseRecipeFromURL(openai: OpenAI, url: string): Promise<RecipeType | null> {
  const response = await openai.responses.parse({
    model: 'gpt-5-mini', // gpt-5
    tools: [
      { type: "web_search_preview" },
    ],
    instructions: `
      Du bist ein Experte für Rezepte.
      Extrahiere strukturierte Rezeptdaten von Webseiten.
      Wichtige Hinweise:
      - Erkenne Zutaten und Mengenangaben genau
      - Schätze Kochzeit und Portionen realistisch ein
      - Gib sinnvolle deutsche Tags an
      - Erstelle klare, schrittweise Anweisungen
      - Nutze keine Zitierungen für die Ausgabe in Texten (Titel, Beschreibung, Anweisungen, ...)
      - Versuche ein Bild des Rezepts zu extrahieren und in der property imageUrl zu setzen, wenn verfügbar
      - Setze die property sourceUrl auf die URL die als Input zum parsen angegebene wurde
    `,
    text: {
      format: zodTextFormat(Recipe, "recipe"),
    },
    input: `Besuche diese URL und extrahiere das Rezept: ${url}.`
  });
  const input_tokens = response.usage?.input_tokens || 0;
  const output_tokens = response.usage?.output_tokens || 0;
  console.log(`Used ${input_tokens} input tokens and ${output_tokens} output tokens.`);
  return response.output_parsed;
}

async function analyzeRecipeFromImage(openai: OpenAI, base64encodedImage: string): Promise<RecipeType | null> {
  const response = await openai.responses.parse({
    model: 'gpt-5-mini', // gpt-5
    tools: [
      { type: "web_search_preview" },
    ],
    instructions: `
      Du bist ein Experte für Rezepte.
      Extrahiere strukturierte Rezeptdaten von Webseiten.
      Wichtige Hinweise:
      - Erkenne Zutaten und Mengenangaben genau
      - Schätze Kochzeit und Portionen realistisch ein
      - Gib sinnvolle deutsche Tags an
      - Erstelle klare, schrittweise Anweisungen
      - Nutze keine Zitierungen für die Ausgabe in Texten (Titel, Beschreibung, Anweisungen, ...)
      - Setze die properties "imageUrl" und "sourceUrl" auf null, da diese nicht aus dem Bild extrahiert werden können
    `,
    text: {
      format: zodTextFormat(Recipe, "recipe"),
    },
    input: [
        {
            role: "user",
            content: [
                { type: "input_text", text: "Extrahiere das Rezept aus diesem Bild" },
                {
                    type: "input_image",
                    image_url: `${base64encodedImage}`,
                    detail: "high",
                },
            ],
        },
    ],
  });
  const input_tokens = response.usage?.input_tokens || 0;
  const output_tokens = response.usage?.output_tokens || 0;
  console.log(`Used ${input_tokens} input tokens and ${output_tokens} output tokens.`);
  return response.output_parsed;
}

Deno.serve(async (req) => {
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

    let response: RecipeType | null = null;

    // Route to appropriate handler based on import type
    switch (type) {
      case 'url':
        console.log('Processing URL import:', content)
        response = await parseRecipeFromURL(openai, content)
        if (!response) {
          throw new Error('No response from OpenAI')
        }

        console.log('OpenAI response:', response)

        return new Response(
          JSON.stringify({
            recipe: response,
            image: response.imageUrl ? await fetchImageAsBase64(response.imageUrl) : null
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      case 'screenshot':
        console.log('Processing image import, image size:', content.length)
        response = await analyzeRecipeFromImage(openai, content)

        if (!response) {
          throw new Error('No response from OpenAI')
        }

        delete response?.sourceUrl
        delete response?.imageUrl

        console.log('OpenAI response:', response)

        return new Response(
          JSON.stringify({
            recipe: response,
            image: content
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid import type. Supported types: url, screenshot' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
    }



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