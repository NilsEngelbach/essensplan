import { createClient, SupabaseClient, User } from "supabase";
import OpenAI from "openai";
import { AppError, AIProvider, createAppError } from "./error.ts";

// OpenCode Go exposes an OpenAI-compatible Chat Completions endpoint.
// See https://opencode.ai/docs/de/go/
const OPENCODE_BASE_URL = "https://opencode.ai/zen/go/v1";
const OPENCODE_DEFAULT_MODEL = "glm-5.2";

// Common CORS headers used across all functions
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Common error response helper
export function createErrorResponse(error: AppError) {
  return new Response(
    JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
    }),
    {
      status: error.statusCode,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

// Common success response helper
export function createSuccessResponse(data: any) {
  return new Response(
    JSON.stringify(data),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

// Authentication verification helper
async function verifyAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!authHeader || !token) {
    throw createAppError.missingAuthHeader();
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: { user }, error: authError } = await supabaseClient
    .auth
    .getUser(token);

  if (authError || !user) {
    throw createAppError.unauthorized();
  }

  return { user, supabaseClient };
}

// Reads the AI_PROVIDER env var and returns the normalized provider.
// Falls back to "opencode" when unset. Unsupported values throw.
export function getAIProvider(): AIProvider {
  const raw = (Deno.env.get("AI_PROVIDER") ?? Deno.env.get("NEXT_PUBLIC_AI_PROVIDER") ?? "").trim().toLowerCase();
  if (raw === "") return "opencode";
  if (raw === "openai" || raw === "opencode") return raw;
  throw createAppError.aiProviderNotConfigured(raw as AIProvider);
}

// Returns the model id used for text-based AI tasks (URL import).
export function getAIModel(): string {
  const provider = getAIProvider();
  if (provider === "openai") {
    return Deno.env.get("OPENAI_MODEL") ?? "gpt-5-mini";
  }
  return Deno.env.get("OPENCODE_MODEL") ?? OPENCODE_DEFAULT_MODEL;
}

// Returns the model id used for image-based AI tasks (screenshot import).
// Not all OpenCode Go models support vision input, so a separate env var
// (OPENCODE_IMAGE_MODEL) lets you pick a vision-capable model. Falls back to
// OPENCODE_MODEL when unset.
export function getAIImageModel(): string {
  const provider = getAIProvider();
  if (provider === "openai") {
    return Deno.env.get("OPENAI_MODEL") ?? "gpt-5-mini";
  }
  return Deno.env.get("OPENCODE_IMAGE_MODEL") ?? Deno.env.get("OPENCODE_MODEL") ?? OPENCODE_DEFAULT_MODEL;
}

// Creates an AI client configured for the active AI_PROVIDER.
// - openai   -> OpenAI SDK against api.openai.com (uses OPENAI_API_KEY)
// - opencode -> OpenAI SDK against the OpenCode Go endpoint (uses OPENCODE_API_KEY)
export function createAIClient(): OpenAI {
  const provider = getAIProvider();

  if (provider === "opencode") {
    const apiKey = Deno.env.get("OPENCODE_API_KEY");
    if (!apiKey) {
      throw createAppError.aiProviderNotConfigured("opencode");
    }
    return new OpenAI({
      apiKey,
      baseURL: OPENCODE_BASE_URL,
    });
  }

  // openai
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    throw createAppError.openAINotConfigured();
  }
  return new OpenAI({ apiKey: openaiApiKey });
}

// Backwards-compatible alias for existing call sites.
export function createOpenAIClient(): OpenAI {
  return createAIClient();
}

// Fetches the textual content of a URL and strips HTML to a plain-text
// approximation so the model can parse the recipe without a web-search tool.
// Truncated to keep request size reasonable.
const URL_CONTENT_MAX_CHARS = 60000;
export async function fetchUrlContent(url: string): Promise<string> {
  try {
    const parsedUrl = new URL(url);
    const response = await fetch(parsedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EssensplanRecipeImporter/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      throw createAppError.urlFetchFailed(`${response.status} ${response.statusText}`);
    }
    let html = await response.text();
    // Strip non-content elements
    html = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
    html = html.replace(/<style[\s\S]*?<\/style>/gi, " ");
    html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
    html = html.replace(/<!--[\s\S]*?-->/g, " ");
    // Replace block-level tags with newlines for readability
    html = html.replace(/<\/(p|div|li|h[1-6]|tr|br|section|article|ul|ol)>/gi, "\n");
    html = html.replace(/<br\s*\/?>/gi, "\n");
    // Drop remaining tags
    const text = html.replace(/<[^>]+>/g, " ");
    // Decode common HTML entities
    const decoded = text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    // Collapse whitespace
    const collapsed = decoded.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    if (collapsed.length === 0) {
      throw createAppError.urlFetchFailed("No text content extracted from URL");
    }
    return collapsed.length > URL_CONTENT_MAX_CHARS
      ? collapsed.slice(0, URL_CONTENT_MAX_CHARS) + "\n…[truncated]"
      : collapsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw createAppError.urlFetchFailed(
      error instanceof Error ? error.message : String(error),
    );
  }
}

// Helper function to fetch image and convert to base64
export async function fetchImageAsBase64(
  imageUrl: string,
): Promise<string | null> {
  try {
    console.log("Fetching image from URL:", imageUrl);
    const url = new URL(imageUrl);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(
        "Failed to fetch image:",
        response.status,
        response.statusText,
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Get content type from response headers
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error("Error fetching image:", error);
    return null;
  }
}

// Generic request handler wrapper with error handling
export async function handleRequest(
  req: Request,
  handler: (req: Request, user: User, supabaseClient: SupabaseClient) => Promise<Response>,
): Promise<Response> {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user, supabaseClient } = await verifyAuth(req);
    return await handler(req, user, supabaseClient);
  } catch (error) {
    console.error("Request handler error:", error);

    if (error instanceof AppError) {
      return createErrorResponse(error);
    }

    const appError = createAppError.internalServerError("Unknown error");
    return createErrorResponse(appError);
  }
}
