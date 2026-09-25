// CareBridge AI model configuration.
//
// The Edge Function uses Gemini's native function-calling API.
// Keep this file provider/model-focused so the provider can be changed
// without hardcoding the model inside the request handler.

export const AI_MODEL_CONFIG = {
  provider: "gemini",
  primaryModel: "gemini-3.1-flash-lite",
  fallbackModels: [],
} as const;
