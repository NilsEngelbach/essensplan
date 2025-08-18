import { createClient, SupabaseClient, User } from "supabase";
import OpenAI from "openai";
import { AppError, createAppError } from "./error.ts";

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

// OpenAI client initialization helper
export function createOpenAIClient(): OpenAI {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openaiApiKey) {
    throw createAppError.openAINotConfigured();
  }

  return new OpenAI({
    apiKey: openaiApiKey,
  });
}

// Helper function to fetch image and convert to base64
export async function fetchImageAsBase64(
  imageUrl: string,
): Promise<string | null> {
  try {
    console.log("Fetching image from URL:", imageUrl);
    const response = await fetch(imageUrl);
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
    throw createAppError.imageFetchFailed(
      error instanceof Error ? error.message : "Unknown error",
    );
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
