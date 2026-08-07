import { z } from "zod";
import { zodTextFormat } from "npm:openai/helpers/zod";
import {
  createAIClient,
  createSuccessResponse,
  fetchImageAsBase64,
  fetchUrlContent,
  getAIModel,
  getAIProvider,
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
      - Rechne alle Einheiten in metrische Einheiten um (g, ml, ...) und verwende diese in der Ausgabe (keine cups, ounces, pounds, ...). TL, EL, Prise sind ok
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
      - Rechne alle Einheiten in metrische Einheiten um (g, ml, ...) und verwende diese in der Ausgabe (keine cups, ounces, pounds, ...). TL, EL, Prise sind ok
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

// Shared system instructions for the opencode (Chat Completions) path.
// The model is asked to return a single JSON object matching the Recipe schema
// (response_format is set to json_object to enforce valid JSON).
const OPENCODE_SYSTEM_INSTRUCTIONS = `
Du bist ein Experte fuer Rezepte.
Extrahiere strukturierte Rezeptdaten und gib sie als EIN JSON-Objekt zurueck.
Wichtige Hinweise:
- Erkenne Zutaten und Mengenangaben genau
- Schaetze Kochzeit und Portionen realistisch ein
- Gib sinnvolle deutsche Tags an
- Erstelle klare, schrittweise Anweisungen
- Nutze keine Zitierungen fuer die Ausgabe in Texten (Titel, Beschreibung, Anweisungen, ...)
- Rechne alle Einheiten in metrische Einheiten um (g, ml, ...) und verwende diese in der Ausgabe (keine cups, ounces, pounds, ...). TL, EL, Prise sind ok
- Gib NUR gueltiges JSON zurueck, KEIN Markdown, KEINE Erklaerungen
`;

// JSON schema description embedded in the system prompt so the model knows the
// expected shape when response_format=json_object is used.
const RECIPE_SCHEMA_DESCRIPTION = `{
  "title": string,
  "description": string,
  "category": "Hauptspeise" | "Salat" | "Dessert" | "Suppe" | "Beilage" | "Fruehstueck" | "Snack",
  "tags": array_of ("Vegetarisch" | "Vegan" | "Glutenfrei" | "Laktosefrei" | "Schnell" | "Gesund" | "Wuerzig" | "Suess"),
  "cookingTime": number (int, minutes),
  "servings": number (int),
  "difficulty": "Einfach" | "Mittel" | "Schwer",
  "imageUrl": string|null (optional),
  "sourceUrl": string|null (optional),
  "ingredients": [{ "name": string, "amount": number (int>=0), "unit": string|null, "notes": string|null, "component": string|null }],
  "instructions": [{ "stepNumber": number (int>=1), "description": string }]
}`;

function parseRecipeFromJson(content: string | null): RecipeType | null {
  if (!content) return null;
  try {
    const trimmed = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const json = JSON.parse(trimmed);
    return Recipe.parse(json);
  } catch (err) {
    console.warn("Failed to parse recipe JSON from model response:", err);
    return null;
  }
}

// OpenCode Go has no web_search tool, so we fetch the page server-side and
// pass the text content to the model.
async function parseRecipeFromURLOpencode(
  openai: OpenAI,
  url: string,
): Promise<RecipeType | null> {
  const pageContent = await fetchUrlContent(url);
  const system = `${OPENCODE_SYSTEM_INSTRUCTIONS}
Das JSON-Objekt muss exakt dieses Schema erfuellen:
${RECIPE_SCHEMA_DESCRIPTION}

Setze die property "sourceUrl" auf die URL, die als Input angegeben wurde.
Versuche, falls in der Seite vorhanden, ein Bild des Rezepts zu erkennen und die property "imageUrl" entsprechend zu setzen.`;
  const response = await openai.chat.completions.create({
    model: getAIModel(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Extrahiere das Rezept von dieser URL: ${url}\n\nSeiteninhalt:\n${pageContent}`,
      },
    ],
  });
  const input_tokens = response.usage?.prompt_tokens ?? 0;
  const output_tokens = response.usage?.completion_tokens ?? 0;
  console.log(`[opencode] Used ${input_tokens} input tokens and ${output_tokens} output tokens.`);
  return parseRecipeFromJson(response.choices[0]?.message?.content ?? null);
}

// OpenCode Go image import via the Chat Completions multimodal content format.
async function analyzeRecipeFromImageOpencode(
  openai: OpenAI,
  base64encodedImage: string,
): Promise<RecipeType | null> {
  const system = `${OPENCODE_SYSTEM_INSTRUCTIONS}
Das JSON-Objekt muss exakt dieses Schema erfuellen:
${RECIPE_SCHEMA_DESCRIPTION}

Setze die properties "imageUrl" und "sourceUrl" auf null, da diese nicht aus dem Bild extrahiert werden koennen.`;
  const response = await openai.chat.completions.create({
    model: getAIModel(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: "Extrahiere das Rezept aus diesem Bild" },
          { type: "image_url", image_url: { url: base64encodedImage } },
        ],
      },
    ],
  });
  const input_tokens = response.usage?.prompt_tokens ?? 0;
  const output_tokens = response.usage?.completion_tokens ?? 0;
  console.log(`[opencode] Used ${input_tokens} input tokens and ${output_tokens} output tokens.`);
  return parseRecipeFromJson(response.choices[0]?.message?.content ?? null);
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

    const client = createAIClient();
    const provider = getAIProvider();

    let response: RecipeType | null = null;

    const parseFromURL = provider === "opencode" ? parseRecipeFromURLOpencode : parseRecipeFromURL;
    const analyzeFromImage = provider === "opencode" ? analyzeRecipeFromImageOpencode : analyzeRecipeFromImage;

    switch (type) {
      case "url":
        console.log(`Processing URL import [${provider}]:`, content);
        response = await parseFromURL(client, content);

        if (!response) {
          throw createAppError.aiRequestFailed("No recipe data returned from AI provider");
        }

        console.log(`${provider} response:`, response);

        return createSuccessResponse({
          recipe: response,
          image: response.imageUrl
            ? await fetchImageAsBase64(response.imageUrl)
            : null,
        });
      case "screenshot":
        console.log(`Processing image import [${provider}], image size:`, content.length);
        response = await analyzeFromImage(client, content);

        if (!response) {
          throw createAppError.aiRequestFailed("No recipe data returned from AI provider");
        }

        delete response?.sourceUrl;
        delete response?.imageUrl;

        console.log(`${provider} response:`, response);

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
