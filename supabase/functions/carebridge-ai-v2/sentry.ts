// Minimal Sentry reporter for the Edge Function. It posts one event to Sentry's envelope endpoint
// with fetch, so there is no SDK to load in the Edge Runtime. Events carry only the request ID,
// status, a scrubbed error summary, and the runtime tag; never message text or user identity.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /\+?\d[\d\s-]{7,}\d/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const MAX_DETAIL_LENGTH = 300;
const TIMEOUT_MS = 2_000;

export function scrubText(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(UUID, "[id]")
    .replace(PHONE, "[phone]")
    .slice(0, MAX_DETAIL_LENGTH);
}

type ParsedDsn = { endpoint: string; publicKey: string; dsn: string };

export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+/, "");
    if (!url.username || !projectId) return null;
    return { endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`, publicKey: url.username, dsn };
  } catch {
    return null;
  }
}

export type ErrorReport = {
  message: string;
  detail?: string;
  status?: number;
  requestId?: string;
  tags?: Record<string, string>;
};

export function buildEnvelope(parsed: ParsedDsn, report: ErrorReport, eventId = crypto.randomUUID().replace(/-/g, "")) {
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
    server_name: "carebridge-ai-v2",
    tags: {
      runtime: "edge",
      ...(report.status ? { status: String(report.status) } : {}),
      ...(report.requestId ? { request_id: report.requestId } : {}),
      ...report.tags,
    },
    exception: {
      values: [{ type: "EdgeFunctionError", value: scrubText(report.message) }],
    },
    extra: report.detail ? { detail: scrubText(report.detail) } : {},
  };
  return [
    JSON.stringify({ event_id: eventId, dsn: parsed.dsn, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

export async function reportError(report: ErrorReport): Promise<boolean> {
  const parsed = parseDsn(Deno.env.get("SENTRY_DSN"));
  if (!parsed) return false;
  try {
    const response = await fetch(parsed.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=carebridge-edge/1.0`,
      },
      body: buildEnvelope(parsed, report),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
