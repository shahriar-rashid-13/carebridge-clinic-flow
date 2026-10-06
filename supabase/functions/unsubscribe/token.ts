// Signed, single-purpose unsubscribe tokens: base64url(payload).base64url(HMAC-SHA256).
// The payload names the patient and campaign and expires; it holds no email or name.

export const TOKEN_DAYS = 60;
const PURPOSE = "unsubscribe";

export type TokenPayload = {
  purpose: string;
  patientId: string;
  campaignId: string | null;
  expiresAt: number;
};

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))),
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createUnsubscribeToken(
  secret: string,
  patientId: string,
  campaignId: string | null,
  now = Date.now(),
): Promise<string> {
  const payload: TokenPayload = {
    purpose: PURPOSE,
    patientId,
    campaignId,
    expiresAt: Math.floor(now / 1000) + TOKEN_DAYS * 86_400,
  };
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(secret, encoded)}`;
}

export async function verifyUnsubscribeToken(
  secret: string,
  token: string,
  now = Date.now(),
): Promise<TokenPayload | null> {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  if (!timingSafeEqual(signature, await hmac(secret, encoded))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as TokenPayload;
    if (payload.purpose !== PURPOSE || typeof payload.patientId !== "string") return null;
    if (typeof payload.expiresAt !== "number" || payload.expiresAt < Math.floor(now / 1000))
      return null;
    return payload;
  } catch {
    return null;
  }
}
