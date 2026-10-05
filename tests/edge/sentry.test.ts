// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEnvelope,
  parseDsn,
  reportError,
  scrubText,
} from "../../supabase/functions/carebridge-ai-v2/sentry.ts";
import { denoEnv } from "../helpers/deno";

const DSN = "https://abc123@o42.ingest.us.sentry.io/777";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete denoEnv["SENTRY_DSN"];
  vi.unstubAllGlobals();
});

describe("Edge Sentry reporter", () => {
  it("parses the DSN into the envelope endpoint and key", () => {
    expect(parseDsn(DSN)).toEqual({
      endpoint: "https://o42.ingest.us.sentry.io/api/777/envelope/",
      publicKey: "abc123",
      dsn: DSN,
    });
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
  });

  it("scrubs and truncates the error detail", () => {
    expect(scrubText("gateway 500 for a@b.co")).toBe("gateway 500 for [email]");
    expect(scrubText("x".repeat(500))).toHaveLength(300);
  });

  it("builds an event with only the runtime, status, and request id tags", () => {
    const [header, item, body] = buildEnvelope(
      parseDsn(DSN)!,
      { message: "AI service is unavailable.", detail: "gateway 502 for a@b.co", status: 502, requestId: "req-1" },
      "e1",
    ).split("\n");
    expect(JSON.parse(header!)).toMatchObject({ event_id: "e1", dsn: DSN });
    expect(JSON.parse(item!)).toEqual({ type: "event" });
    const event = JSON.parse(body!);
    expect(event.tags).toEqual({ runtime: "edge", status: "502", request_id: "req-1" });
    expect(event.exception.values[0].value).toBe("AI service is unavailable.");
    expect(event.extra.detail).toBe("gateway 502 for [email]");
    expect(event.user).toBeUndefined();
  });

  it("does nothing without a DSN", async () => {
    await expect(reportError({ message: "x" })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the envelope with the Sentry auth header", async () => {
    denoEnv["SENTRY_DSN"] = DSN;
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(reportError({ message: "boom", status: 500 })).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://o42.ingest.us.sentry.io/api/777/envelope/");
    expect((init?.headers as Record<string, string>)["X-Sentry-Auth"]).toContain("sentry_key=abc123");
  });
});
