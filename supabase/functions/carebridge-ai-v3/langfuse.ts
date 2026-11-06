/**
 * Optional Langfuse OTEL-style event post for agentic RAG traces.
 * No-ops when LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are unset (free-tier optional).
 * Never throws into the chat path — failures are swallowed and logged.
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

function langfuseConfig(): { host: string; auth: string } | null {
  const publicKey = Deno.env.get("LANGFUSE_PUBLIC_KEY")?.trim();
  const secretKey = Deno.env.get("LANGFUSE_SECRET_KEY")?.trim();
  if (!publicKey || !secretKey) return null;
  const host = (
    Deno.env.get("LANGFUSE_HOST") ||
    Deno.env.get("LANGFUSE_BASE_URL") ||
    "https://cloud.langfuse.com"
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
  if (!cfg) return;

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

  try {
    const res = await fetch(`${cfg.host}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${cfg.auth}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) {
      console.warn(`langfuse ingest HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(
      `langfuse ingest failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
