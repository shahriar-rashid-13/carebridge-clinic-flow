// CareBridge AI requires tool/function calling.
// Only select OpenRouter models that support tools/tool_choice.
// Check the model's OpenRouter capability page before switching.
export const AI_MODEL_CONFIG = {
  primaryModel: "inclusionai/ling-3.0-flash-vl:free",
  fallbackModels: ["qwen/qwen3.8-27b:free"],
} as const;
