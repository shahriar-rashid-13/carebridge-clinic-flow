// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  nextStatus,
  sign,
  statusForEvent,
  TOLERANCE_SECONDS,
  verifySvix,
} from "../../supabase/functions/resend-webhook/webhook.ts";

const SECRET = `whsec_${btoa("carebridge-test-secret-32-bytes!")}`;
const BODY = JSON.stringify({ type: "email.delivered", data: { email_id: "msg_123" } });
const NOW = 1_790_000_000;

async function headers(overrides: Partial<{ id: string; timestamp: string; body: string }> = {}) {
  const id = overrides.id ?? "msg_svix_1";
  const timestamp = overrides.timestamp ?? String(NOW);
  const signature = `v1,${await sign(SECRET, id, timestamp, overrides.body ?? BODY)}`;
  return { id, timestamp, signature };
}

describe("verifySvix", () => {
  it("accepts a valid signature", async () => {
    expect(await verifySvix(SECRET, await headers(), BODY, NOW)).toEqual({ ok: true });
  });

  it("accepts a valid signature among several", async () => {
    const h = await headers();
    expect(
      await verifySvix(SECRET, { ...h, signature: `v1,bm9wZQ== ${h.signature}` }, BODY, NOW),
    ).toEqual({
      ok: true,
    });
  });

  it("rejects a changed body", async () => {
    const result = await verifySvix(
      SECRET,
      await headers(),
      BODY.replace("delivered", "bounced"),
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: "signature mismatch" });
  });

  it("rejects a signature made with another secret", async () => {
    const other = `whsec_${btoa("another-secret-another-secret!!")}`;
    expect((await verifySvix(other, await headers(), BODY, NOW)).ok).toBe(false);
  });

  it("rejects old and future timestamps", async () => {
    const old = await headers({ timestamp: String(NOW - TOLERANCE_SECONDS - 1) });
    expect(await verifySvix(SECRET, old, BODY, NOW)).toEqual({
      ok: false,
      reason: "timestamp outside tolerance",
    });
    const future = await headers({ timestamp: String(NOW + TOLERANCE_SECONDS + 1) });
    expect((await verifySvix(SECRET, future, BODY, NOW)).ok).toBe(false);
  });

  it("rejects missing headers", async () => {
    expect(
      await verifySvix(SECRET, { id: null, timestamp: null, signature: null }, BODY, NOW),
    ).toEqual({
      ok: false,
      reason: "missing headers",
    });
  });
});

describe("status changes", () => {
  it("maps Resend event types", () => {
    expect(statusForEvent("email.delivered")).toBe("delivered");
    expect(statusForEvent("email.delivery_delayed")).toBe("delayed");
    expect(statusForEvent("email.opened")).toBeNull();
  });

  it("only moves forward", () => {
    expect(nextStatus("sent", "delivered")).toBe("delivered");
    expect(nextStatus("delayed", "delivered")).toBe("delivered");
    expect(nextStatus("bounced", "delivered")).toBeNull();
    expect(nextStatus("delivered", "delivered")).toBeNull();
    expect(nextStatus("delivered", "complained")).toBe("complained");
  });

  it("never changes failed or skipped rows", () => {
    expect(nextStatus("failed", "delivered")).toBeNull();
    expect(nextStatus("skipped", "bounced")).toBeNull();
  });
});
