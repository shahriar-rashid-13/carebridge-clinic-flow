/**
 * Optional Langfuse event post for agentic RAG traces.
 * No-ops when LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are unset.
 * Never throws into the chat path — failures are swallowed and logged.
 *
 * Host: CareBridge JP region → https://jp.cloud.langfuse.com
 * Prefer LANGFUSE_BASE_URL (then LANGFUSE_HOST). US cloud.langfuse.com is wrong for JP keys.
 *
 * Ingest: POST {host}/api/public/otel/v1/traces (OTLP/HTTP JSON + x-langfuse-ingestion-version: 4).
 * Legacy POST /api/public/ingestion (trace-create/span-create) is sunset on Langfuse Cloud
 * 2026-11-16 and can leave the Tracing UI empty even on HTTP 207.
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

function edgeWaitUntil(pending: Promise<unknown>): void {
  (
    globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }
  ).EdgeRuntime?.waitUntil(pending);
}

/** OTEL trace id = 16 bytes hex; span id = 8 bytes hex. */
function otelTraceId(uuid: string): string {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  return (hex + "0".repeat(32)).slice(0, 32);
}

function otelSpanId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function attrString(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

function attrBool(key: string, value: boolean) {
  return { key, value: { boolValue: value } };
}

function attrInt(key: string, value: number) {
  return { key, value: { intValue: String(Math.trunc(value)) } };
}

function attrTags(tags: string[]) {
  return {
    key: "langfuse.trace.tags",
    value: {
      arrayValue: {
        values: tags.map((t) => ({ stringValue: t })),
      },
    },
  };
}

function buildOtlpBody(event: LangfuseAgenticEvent) {
  const traceId = otelTraceId(event.traceId);
  const spanId = otelSpanId();
  const endNs = BigInt(Date.now()) * 1_000_000n;
  const startNs = endNs - BigInt(Math.max(event.ms ?? 1, 1)) * 1_000_000n;
  const input = JSON.stringify({
    question: event.question,
    queries: event.queries,
  });
  const output = JSON.stringify({
    supported: event.supported,
    refused: event.refused,
    results: event.results,
    support_reason: event.supportReason,
  });
  const tags = [
    "carebridge-ai-v3",
    "agentic-rag",
    event.refused ? "refuse" : "answer",
    event.complex ? "multi-hop" : "single",
  ];

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            attrString("service.name", "carebridge-ai-v3"),
            attrString("service.version", "assessment-4"),
          ],
        },
        scopeSpans: [
          {
            scope: { name: "carebridge-agentic-rag", version: "a4" },
            spans: [
              {
                traceId,
                spanId,
                name: event.name,
                kind: 1, // INTERNAL
                startTimeUnixNano: String(startNs),
                endTimeUnixNano: String(endNs),
                attributes: [
                  attrString("langfuse.trace.name", event.name),
                  attrString("langfuse.observation.type", "retriever"),
                  attrString("langfuse.observation.input", input),
                  attrString("langfuse.observation.output", output),
                  attrTags(tags),
                  attrString("langfuse.trace.metadata.assessment", "A4-Option1"),
                  attrString("langfuse.trace.metadata.plan_source", event.planSource),
                  attrString(
                    "langfuse.trace.metadata.support_source",
                    event.supportSource,
                  ),
                  attrString(
                    "langfuse.observation.metadata.support_reason",
                    event.supportReason.slice(0, 500),
                  ),
                  attrBool("langfuse.trace.metadata.complex", event.complex),
                  attrBool("langfuse.trace.metadata.refused", event.refused),
                  attrBool("langfuse.trace.metadata.supported", event.supported),
                  attrInt("langfuse.observation.metadata.hops", event.hops),
                  attrInt(
                    "langfuse.observation.metadata.candidates",
                    event.candidates,
                  ),
                  attrInt("langfuse.observation.metadata.results", event.results),
                  attrInt("langfuse.observation.metadata.ms", event.ms ?? 0),
                ],
                status: {
                  code: event.refused ? 2 : 1, // ERROR on refuse, OK otherwise
                  message: event.refused ? event.supportReason.slice(0, 200) : "",
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Schedule ingest immediately (waitUntil registered sync) and return the promise. */
export function traceAgenticRag(event: LangfuseAgenticEvent): Promise<void> {
  const cfg = langfuseConfig();
  if (!cfg) {
    console.log("langfuse disabled: missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY");
    return Promise.resolve();
  }

  console.log(`langfuse enabled host=${cfg.host} trace=${event.traceId.slice(0, 8)}`);

  const ingestUrl = `${cfg.host}/api/public/otel/v1/traces`;
  const body = buildOtlpBody(event);

  const pending = (async () => {
    try {
      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${cfg.auth}`,
          "x-langfuse-ingestion-version": "4",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      const raw = (await res.text().catch(() => "")).slice(0, 800);
      console.log(
        `langfuse otel ingest HTTP ${res.status} host=${cfg.host} body=${raw || "(empty)"}`,
      );
      if (res.status >= 400) {
        console.warn(
          `langfuse otel ingest failed status=${res.status} — rotate JP keys if 401/403; check project matches JP UI`,
        );
      }
    } catch (err) {
      console.warn(
        `langfuse otel ingest failed host=${cfg.host}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();

  // Register BEFORE returning so the isolate stays alive even if the caller uses void.
  edgeWaitUntil(pending);
  return pending;
}
