// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callGateway, MODEL_ALIAS } from "../../supabase/functions/carebridge-ai-v2/gateway.ts";
import { denoEnv } from "../helpers/deno";

const fetchMock = vi.fn<typeof fetch>();

const completion = (
  message: Record<string, unknown>,
  model = "gemini/gemini-3.1-flash-lite",
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify({ model, choices: [{ message }], usage: { total_tokens: 12 } }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });

const call = () => callGateway({ messages: [{ role: "user", content: "hi" }], timeoutMs: 1000 });

beforeEach(() => {
  denoEnv["LITELLM_BASE_URL"] = "https://litellm.test/";
  denoEnv["LITELLM_API_KEY"] = "sk-test";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callGateway", () => {
  it("fails closed when the gateway is not configured", async () => {
    delete denoEnv["LITELLM_API_KEY"];
    await expect(call()).resolves.toMatchObject({
      ok: false,
      status: 500,
      error: "AI service is not configured.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to LiteLLM with the model alias and bearer key", async () => {
    fetchMock.mockResolvedValue(completion({ content: "Hello" }));

    const result = await call();

    expect(result).toMatchObject({
      ok: true,
      content: "Hello",
      toolCalls: [],
      servedByFallback: false,
      usage: { total_tokens: 12 },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://litellm.test/chat/completions");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk-test");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ model: MODEL_ALIAS, messages: [{ role: "user", content: "hi" }] });
  });

  it("sends tools with tool_choice and keeps only function calls", async () => {
    fetchMock.mockResolvedValue(
      completion({
        content: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "get_doctors", arguments: "{}" } },
          { type: "function", function: { name: "no_id" } },
        ],
        thought_signature: "sig",
      }),
    );

    const result = await callGateway({
      messages: [],
      tools: [{ type: "function", function: { name: "get_doctors" } }],
      toolChoice: "none",
      timeoutMs: 1000,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.tool_choice).toBe("none");
    expect(body.tools).toHaveLength(1);
    if (!result.ok) throw new Error("expected ok");
    expect(result.toolCalls.map((toolCall) => toolCall.id)).toEqual(["c1"]);
    expect(result.rawMessage).toMatchObject({ role: "assistant", thought_signature: "sig" });
  });

  it("detects a fallback from the LiteLLM header", async () => {
    fetchMock.mockResolvedValue(
      completion({ content: "x" }, "gemini/gemini-3.1-flash-lite", {
        "x-litellm-attempted-fallbacks": "1",
      }),
    );
    await expect(call()).resolves.toMatchObject({ ok: true, servedByFallback: true });
  });

  it("treats the Gemini retry group as the primary model", async () => {
    fetchMock.mockResolvedValue(
      completion({ content: "x" }, "gemini-3.1-flash-lite", {
        "x-litellm-attempted-fallbacks": "1",
        "x-litellm-model-group": "carebridge-agent-retry",
      }),
    );
    await expect(call()).resolves.toMatchObject({ ok: true, servedByFallback: false });
  });

  it("detects the fallback model group from the LiteLLM header", async () => {
    fetchMock.mockResolvedValue(
      completion({ content: "x" }, "nvidia/nemotron", {
        "x-litellm-attempted-fallbacks": "2",
        "x-litellm-model-group": "carebridge-agent-fallback",
      }),
    );
    await expect(call()).resolves.toMatchObject({ ok: true, servedByFallback: true });
  });

  it("detects the second fallback model group", async () => {
    fetchMock.mockResolvedValue(
      completion({ content: "x" }, "qwen/qwen3.8-27b:free", {
        "x-litellm-attempted-fallbacks": "3",
        "x-litellm-model-group": "carebridge-agent-fallback-2",
      }),
    );
    await expect(call()).resolves.toMatchObject({ ok: true, servedByFallback: true });
  });

  it("detects a fallback from a non-Gemini model name", async () => {
    fetchMock.mockResolvedValue(
      completion({ content: "x" }, "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"),
    );
    await expect(call()).resolves.toMatchObject({ ok: true, servedByFallback: true });
  });

  it.each([
    [429, 429, "AI service is busy. Please try again shortly."],
    [503, 502, "AI service is unavailable."],
  ])("maps HTTP %i to %i", async (upstream, status, error) => {
    fetchMock.mockResolvedValue(new Response("upstream down", { status: upstream }));
    const result = await call();
    expect(result).toMatchObject({ ok: false, status, error });
    if (!result.ok) expect(result.detail).toContain(`gateway ${upstream}: upstream down`);
  });

  it("maps a timeout to 504", async () => {
    fetchMock.mockRejectedValue(new DOMException("signal timed out", "TimeoutError"));
    await expect(call()).resolves.toMatchObject({
      ok: false,
      status: 504,
      error: "AI service timed out. Please try again.",
    });
  });

  it("maps a network error to 502", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(call()).resolves.toMatchObject({ ok: false, status: 502, detail: "fetch failed" });
  });

  it("rejects a reply without a message", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    await expect(call()).resolves.toMatchObject({
      ok: false,
      status: 502,
      error: "AI service returned an invalid reply.",
    });
  });
});
