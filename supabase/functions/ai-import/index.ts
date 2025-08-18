import { z } from "zod";
import { zodTextFormat } from "npm:openai/helpers/zod";
import {
  createOpenAIClient,
  createSuccessResponse,
  fetchImageAsBase64,
  handleRequest,
} from "../_shared/utils.ts";
import { createAppError } from "../_shared/error.ts";
import OpenAI from "openai";

const Recipe = z.object({
  title: z.string(),
  description: z.string(),
  category: z.enum([
    "Hauptspeise",
    "Salat",
    "Dessert",
    "Suppe",
    "Beilage",
    "Frühstück",
    "Snack",
  ]),
  tags: z.array(
    z.enum([
      "Vegetarisch",
      "Vegan",
      "Glutenfrei",
      "Laktosefrei",
      "Schnell",
      "Gesund",
      "Würzig",
      "Süß",
    ]),
  ),
  cookingTime: z.number().int(),
  servings: z.number().int(),
  difficulty: z.enum(["Einfach", "Mittel", "Schwer"]),
  imageUrl: z.string().nullable().optional(), // Optional image URL
  sourceUrl: z.string().nullable().optional(), // Optional source URL
  ingredients: z.array(
    z.object({
      name: z.string(),
      amount: z.number().int().min(0),
      unit: z.string().nullable(), // e.g. 'g', 'ml', 'Tasse'
      notes: z.string().nullable(), // e.g. 'optional', 'nach Geschmack'
      component: z.string().nullable(), // e.g. 'Teig', 'Füllung'
    }),
  ),
  instructions: z.array(
    z.object({
      stepNumber: z.number().int().min(1),
      description: z.string(),
    }),
  ),
});

type RecipeType = z.infer<typeof Recipe>;

async function parseRecipeFromURL(
  openai: OpenAI,
  url: string,
): Promise<RecipeType | null> {
  const response = await openai.responses.parse({
    model: "gpt-5-mini", // gpt-5
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
    input: `Besuche diese URL und extrahiere das Rezept: ${url}.`,
  });
  const input_tokens = response.usage?.input_tokens || 0;
  const output_tokens = response.usage?.output_tokens || 0;
  console.log(
    `Used ${input_tokens} input tokens and ${output_tokens} output tokens.`,
  );
  return response.output_parsed;
}

async function analyzeRecipeFromImage(
  openai: OpenAI,
  base64encodedImage: string,
): Promise<RecipeType | null> {
  const response = await openai.responses.parse({
    model: "gpt-5-mini",
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
  console.log(
    `Used ${input_tokens} input tokens and ${output_tokens} output tokens.`,
  );
  return response.output_parsed;
}

Deno.serve(async (req) => {
  return await handleRequest(req, async (req, _user, _supabaseClient) => {
    const { type, content } = await req.json();

    if (!type) {
      throw createAppError.missingRequiredField("type");
    }

    if (!content) {
      throw createAppError.missingRequiredField("content");
    }

    const openai = createOpenAIClient();

    let response: RecipeType | null = null;

    switch (type) {
      case "url":
        console.log("Processing URL import:", content);
        response = await parseRecipeFromURL(openai, content);
        
        if (!response) {
          throw createAppError.openAIRequestFailed(
            "No recipe data returned from OpenAI",
          );
        }

        console.log("OpenAI response:", response);

        return createSuccessResponse({
          recipe: response,
          image: response.imageUrl
            ? await fetchImageAsBase64(response.imageUrl)
            : null,
        });
      case "screenshot":
        console.log("Processing image import, image size:", content.length);
        response = await analyzeRecipeFromImage(openai, content);

        if (!response) {
          throw createAppError.openAIRequestFailed(
            "No recipe data returned from OpenAI",
          );
        }

        delete response?.sourceUrl;
        delete response?.imageUrl;

        console.log("OpenAI response:", response);

        return createSuccessResponse({
          recipe: response,
          image: content, // Return the original base64 image data for now, later we might want to use AI to extract an image from the input
        });
      default:
        throw createAppError.invalidRequest(
          "Invalid import type. Supported types: url, screenshot",
        );
    }
  });
});
