import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, content } = body

    if (!type || !content) {
      return NextResponse.json({ error: 'Type and content are required' }, { status: 400 })
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
            {"name": "Zutat", "amount": 100, "unit": "g", "notes": "optional"}
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
            {"name": "Zutat", "amount": 100, "unit": "g", "notes": "optional"}
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
            {"name": "Zutat", "amount": 100, "unit": "g", "notes": "optional"}
          ],
          "instructions": [
            {"stepNumber": 1, "description": "Schritt 1"}
          ]
        }
        
        Bildinhalt: ${content}`
        break

      default:
        return NextResponse.json({ error: 'Invalid import type' }, { status: 400 })
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Du bist ein Experte für Rezepte. Extrahiere strukturierte Rezeptdaten aus verschiedenen Quellen."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })

    const response = completion.choices[0]?.message?.content
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

    return NextResponse.json(recipe)
  } catch (error) {
    console.error('AI import error:', error)
    return NextResponse.json({ 
      error: 'Failed to import recipe',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 