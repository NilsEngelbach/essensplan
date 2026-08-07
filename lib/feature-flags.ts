// Frontend feature flags driven by public env vars.
// The backend AI provider switch lives in the Supabase edge functions
// (AI_PROVIDER env var). Its public mirror is NEXT_PUBLIC_AI_PROVIDER so the
// UI can proactively hide features that are not supported by the active
// provider. Defaults to "opencode" to match the backend default.

export type PublicAIProvider = "openai" | "opencode";

export const PUBLIC_AI_PROVIDER: PublicAIProvider =
  (process.env.NEXT_PUBLIC_AI_PROVIDER as PublicAIProvider) === "openai"
    ? "openai"
    : "opencode";

// Image enhancement relies on OpenAI's image_generation tool and is not
// available through OpenCode Go, so it is hidden when the active provider is
// not OpenAI.
export const IMAGE_ENHANCEMENT_ENABLED: boolean = PUBLIC_AI_PROVIDER === "openai";