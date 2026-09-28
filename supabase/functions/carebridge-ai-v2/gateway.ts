export const MODEL_ALIAS = "carebridge-agent";
// Used for the remaining rounds of a turn after the gateway fell back, because
// Gemini rejects tool-call history that lacks its own thought signatures.
export const FALLBACK_MODEL_ALIAS = "carebridge-agent-fallback";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type GatewayMessage = Record<string, unknown>;

export type GatewayResult =
  | {
      ok: true;
      content: string | null;
      toolCalls: ToolCall[];
      // Returned message is sent back unchanged so provider-specific fields
      // (for example Gemini thought signatures) survive the tool round-trip.
      rawMessage: GatewayMessage;
      model: string | null;
      servedByFallback: boolean;
      usage: unknown;
    }
  | { ok: false; status: number; error: string; detail: string };

export async function callGateway(options: {
  model?: string;
  messages: GatewayMessage[];
  tools?: unknown[];
  toolChoice?: "auto" | "none";
  timeoutMs: number;
}): Promise<GatewayResult> {
  const baseUrl = Deno.env.get("LITELLM_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("LITELLM_API_KEY");
  if (!baseUrl || !apiKey) {
    return { ok: false, status: 500, error: "AI service is not configured.", detail: "missing gateway env" };
  }

  const body: Record<string, unknown> = { model: options.model ?? MODEL_ALIAS, messages: options.messages };
  if (options.tools?.length) {
    body["tools"] = options.tools;
    body["tool_choice"] = options.toolChoice ?? "auto";
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      error: timedOut ? "AI service timed out. Please try again." : "AI service is unavailable.",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!response.ok) {
    const detail = `gateway ${response.status}: ${(await response.text().catch(() => "")).slice(0, 800)}`;
    if (response.status === 429) {
      return { ok: false, status: 429, error: "AI service is busy. Please try again shortly.", detail };
    }
    return { ok: false, status: 502, error: "AI service is unavailable.", detail };
  }

  const data = await response.json().catch(() => null);
  const message = data?.choices?.[0]?.message;
  if (!message || typeof message !== "object") {
    return { ok: false, status: 502, error: "AI service returned an invalid reply.", detail: "missing message" };
  }
  const model = typeof data?.model === "string" ? data.model : null;
  const attemptedFallbacks = Number(response.headers.get("x-litellm-attempted-fallbacks")) || 0;
  const servedByFallback =
    attemptedFallbacks > 0 ||
    (model !== null && model !== MODEL_ALIAS && !model.toLowerCase().includes("gemini"));
  const toolCalls: ToolCall[] = Array.isArray(message.tool_calls)
    ? message.tool_calls.filter((call: any) => call?.type === "function" && typeof call?.id === "string")
    : [];
  return {
    ok: true,
    content: typeof message.content === "string" ? message.content : null,
    toolCalls,
    rawMessage: { ...message, role: "assistant" },
    model,
    servedByFallback,
    usage: data?.usage ?? null,
  };
}
