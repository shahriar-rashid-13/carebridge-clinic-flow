export const TOLERANCE_SECONDS = 5 * 60;

// Higher rank wins, so a late "delivered" never overwrites "bounced".
const STATUS_RANK: Record<string, number> = {
  queued: 0,
  sending: 0,
  sent: 1,
  delayed: 2,
  delivered: 3,
  bounced: 4,
  complained: 5,
};

const EVENT_STATUS: Record<string, string> = {
  "email.sent": "sent",
  "email.delivery_delayed": "delayed",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export type VerifyResult = { ok: true } | { ok: false; reason: string };

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sign(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return bytesToBase64(mac);
}

// Svix signature check on the raw body, as used by Resend webhooks.
export async function verifySvix(
  secret: string,
  headers: SvixHeaders,
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!headers.id || !headers.timestamp || !headers.signature)
    return { ok: false, reason: "missing headers" };
  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }
  let expected: string;
  try {
    expected = await sign(secret, headers.id, headers.timestamp, body);
  } catch {
    return { ok: false, reason: "invalid secret" };
  }
  const match = headers.signature
    .split(" ")
    .map((part) => part.split(","))
    .some(([version, value]) => version === "v1" && !!value && timingSafeEqual(value, expected));
  return match ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

export function statusForEvent(type: string): string | null {
  return EVENT_STATUS[type] ?? null;
}

// Returns the new status, or null when the event must not change the row.
export function nextStatus(current: string, incoming: string): string | null {
  if (!(current in STATUS_RANK) || !(incoming in STATUS_RANK)) return null;
  return STATUS_RANK[incoming]! > STATUS_RANK[current]! ? incoming : null;
}
