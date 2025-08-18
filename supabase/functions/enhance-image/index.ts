import OpenAI from "openai";
import { 
  createSuccessResponse,
  createOpenAIClient,
  handleRequest 
} from '../_shared/utils.ts'
import { createAppError } from '../_shared/error.ts'

interface EnhanceImageRequest {
  base64ImageData: string
  recipeTitle?: string
  ingredients?: string[]
}

async function enhanceImageWithOpenAI(openai: OpenAI, input: EnhanceImageRequest) {
  let prompt = 'Verbessere das folgende Bild.'

  if (input.recipeTitle) {
    prompt += ` Das Gericht heißt "${input.recipeTitle}".`
  }
  if (input.ingredients && input.ingredients.length > 0) {
    const ingredientsList = input.ingredients.join(', ')
    prompt += ` Die Zutaten sind: ${ingredientsList}.`
  }

  const response = await openai.responses.create({
    model: "gpt-5-mini",
    tools: [{ type: "image_generation" }],
    instructions: `
      Du bist ein Fotograf, der Bilder von Rezepten für Kochbücher und Online Blogs erstellt.
      - Verbessere das Bild für eine ansprechende Präsentation
      - Verwende hochwertige Beleuchtung und ansprechende Komposition
      - Füge relevante Zutaten und Dekorationen hinzu
      - GGf. handelt es sich um ein Foto von einer Kochbuchseite, dann stelle das Bild vom Gericht auf der Seite frei (ohne Text etc.)
    `,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: input.base64ImageData,
            detail: "high",
          }
        ],
      },
    ],
  });

  const input_tokens = response.usage?.input_tokens || 0;
  const output_tokens = response.usage?.output_tokens || 0;
  console.log(`Used ${input_tokens} input tokens and ${output_tokens} output tokens.`);
  console.log('OpenAI response:', response.output);

  const resultImageData = response.output
    .filter((output) => output.type === "image_generation_call")
    .map((output) => output.result);

  if (resultImageData.length > 0) {
    return `data:image/jpeg;base64,${resultImageData[0]}`;
  } else {
    return null;
  }
}


Deno.serve(async (req) => {
  return await handleRequest(req, async (req, _user, _supabaseClient) => {
    const input: EnhanceImageRequest = await req.json()

    if (!input.base64ImageData) {
      throw createAppError.missingRequiredField('base64ImageData')
    }

    const openai = createOpenAIClient();

    const enhancedImageData = await enhanceImageWithOpenAI(openai, input);

    if (!enhancedImageData) {
      throw createAppError.openAIRequestFailed('OpenAI API did not return an enhanced image')
    }

    return createSuccessResponse({ 
      enhancedImageData
    });
  });
});