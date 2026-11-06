/**
 * Optional Langfuse OTEL-style event post for agentic RAG traces.
 * No-ops when LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are unset (free-tier optional).
 * Never throws into the chat path — failures are swallowed and logged.
 *
 * Host: CareBridge uses the JP region. Set LANGFUSE_BASE_URL (or LANGFUSE_HOST) to
 * https://jp.cloud.langfuse.com — the US default https://cloud.langfuse.com will
 * accept nothing for JP project keys (or show empty Tracing).
 */

export type LangfuseAgenticEvent = {
  name: string;
  traceId: string;
  question: string;
  complex: boolean;
  planSource: string;
  queries: string[];
  hops: number;
  supported: boolean;
  refused: boolean;
  supportSource: string;
  supportReason: string;
  candidates: number;
  results: number;
  ms?: number;
};

/** Prefer LANGFUSE_BASE_URL; fall back to LANGFUSE_HOST; then JP CareBridge region. */
const DEFAULT_LANGFUSE_HOST = "https://jp.cloud.langfuse.com";

function langfuseConfig(): { host: string; auth: string } | null {
  const publicKey = Deno.env.get("LANGFUSE_PUBLIC_KEY")?.trim();
  const secretKey = Deno.env.get("LANGFUSE_SECRET_KEY")?.trim();
  if (!publicKey || !secretKey) return null;
  const host = (
    Deno.env.get("LANGFUSE_BASE_URL") ||
    Deno.env.get("LANGFUSE_HOST") ||
    DEFAULT_LANGFUSE_HOST
  ).replace(/\/+$/, "");
  const auth = btoa(`${publicKey}:${secretKey}`);
  return { host, auth };
}

export function langfuseEnabled(): boolean {
  return langfuseConfig() !== null;
}

/** Fire-and-forget ingestion. Safe to call without awaiting in hot paths. */
export async function traceAgenticRag(event: LangfuseAgenticEvent): Promise<void> {
  const cfg = langfuseConfig();
  if (!cfg) {
    console.log("langfuse disabled: missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY");
    return;
  }

  console.log(`langfuse enabled host=${cfg.host}`);

  const now = new Date().toISOString();
  const body = {
    batch: [
      {
        id: crypto.randomUUID(),
        type: "trace-create",
        timestamp: now,
        body: {
          id: event.traceId,
          name: event.name,
          input: { question: event.question },
          output: {
            supported: event.supported,
            refused: event.refused,
            results: event.results,
          },
          metadata: {
            complex: event.complex,
            plan_source: event.planSource,
            queries: event.queries,
            hops: event.hops,
            support_source: event.supportSource,
            support_reason: event.supportReason,
            candidates: event.candidates,
            ms: event.ms ?? null,
            assessment: "A4-Option1",
            langfuse_host: cfg.host,
          },
          tags: [
            "carebridge-ai-v3",
            "agentic-rag",
            event.refused ? "refuse" : "answer",
            event.complex ? "multi-hop" : "single",
          ],
        },
      },
    ],
  };

  const ingestUrl = `${cfg.host}/api/public/ingestion`;

  const pending = (async () => {
    try {
      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${cfg.auth}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(4_000),
      });
      // Never log Authorization or key material — status + host only.
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 120);
        console.warn(
          `langfuse ingest HTTP ${res.status} host=${cfg.host} detail=${detail}`,
        );
      } else {
        console.log(`langfuse ingest HTTP ${res.status} host=${cfg.host}`);
      }
    } catch (err) {
      console.warn(
        `langfuse ingest failed host=${cfg.host}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();

  // Keep the isolate alive after the HTTP response (same pattern as Sentry).
  (
    globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }
  ).EdgeRuntime?.waitUntil(pending);

  await pending;
}
