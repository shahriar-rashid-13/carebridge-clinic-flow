// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { denoEnv } from "../helpers/deno";
import {
  TOKEN_DAYS,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../../supabase/functions/unsubscribe/token.ts";

const db = vi.hoisted(() => ({
  updated: [] as { id: string }[],
  updates: [] as { values: Record<string, unknown>; filters: [string, unknown][] }[],
  inserts: [] as Record<string, unknown>[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        const entry = { values, filters: [] as [string, unknown][] };
        db.updates.push(entry);
        const chain = {
          eq: (column: string, value: unknown) => {
            entry.filters.push([column, value]);
            return chain;
          },
          select: async () => ({ data: db.updated, error: null }),
        };
        return chain;
      },
      insert: async (row: Record<string, unknown>) => {
        db.inserts.push({ table, ...row });
        return { error: null };
      },
    }),
  })),
}));

const { handler, readRequest } = await import("../../supabase/functions/unsubscribe/index.ts");

const SECRET = "test-secret";
const NOW = Date.parse("2026-10-06T06:00:00Z");

describe("unsubscribe tokens", () => {
  it("round-trips the patient and campaign", async () => {
    const token = await createUnsubscribeToken(SECRET, "p-1", "c-1", NOW);
    expect(await verifyUnsubscribeToken(SECRET, token, NOW)).toMatchObject({
      patientId: "p-1",
      campaignId: "c-1",
    });
  });

  it("rejects a token signed with another secret", async () => {
    const token = await createUnsubscribeToken("other-secret", "p-1", "c-1", NOW);
    expect(await verifyUnsubscribeToken(SECRET, token, NOW)).toBeNull();
  });

  it("rejects a token whose payload was edited", async () => {
    const token = await createUnsubscribeToken(SECRET, "p-1", "c-1", NOW);
    const [, signature] = token.split(".");
    const forged = btoa(
      JSON.stringify({
        purpose: "unsubscribe",
        patientId: "p-2",
        campaignId: null,
        expiresAt: 9e9,
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifyUnsubscribeToken(SECRET, `${forged}.${signature}`, NOW)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await createUnsubscribeToken(SECRET, "p-1", null, NOW);
    const later = NOW + (TOKEN_DAYS + 1) * 86_400_000;
    expect(await verifyUnsubscribeToken(SECRET, token, later)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    for (const bad of ["", "abc", "a.b.c", "!!!.???"]) {
      expect(await verifyUnsubscribeToken(SECRET, bad, NOW)).toBeNull();
    }
  });
});

describe("readRequest", () => {
  it("reads the token and scope from the page's JSON body", async () => {
    const req = new Request("https://db.test/functions/v1/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "t-1", scope: "all" }),
    });
    expect(await readRequest(req)).toEqual({ token: "t-1", scope: "all" });
  });

  it("reads a one-click POST with the token in the URL as a campaign opt-out", async () => {
    const req = new Request("https://db.test/functions/v1/unsubscribe?token=t-2", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(await readRequest(req)).toEqual({ token: "t-2", scope: "campaign" });
  });
});

describe("handler", () => {
  beforeEach(() => {
    Object.assign(denoEnv, {
      SUPABASE_URL: "https://db.test",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      UNSUBSCRIBE_SECRET: SECRET,
    });
    db.updated = [{ id: "p-1" }];
    db.updates = [];
    db.inserts = [];
  });

  const post = (body: unknown) =>
    handler(
      new Request("https://db.test/functions/v1/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  it("answers the CORS preflight", async () => {
    const res = await handler(
      new Request("https://db.test/functions/v1/unsubscribe", { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("rejects an invalid token without touching the database", async () => {
    const res = await post({ token: "forged.token" });
    expect(res.status).toBe(400);
    expect(db.updates).toHaveLength(0);
  });

  it("sets the campaign opt-out and logs it once", async () => {
    const token = await createUnsubscribeToken(SECRET, "p-1", "c-1");
    const res = await post({ token });
    expect(await res.json()).toEqual({ ok: true, scope: "campaign" });
    expect(db.updates[0]).toEqual({
      values: { campaign_opt_out: true },
      filters: [
        ["id", "p-1"],
        ["campaign_opt_out", false],
      ],
    });
    expect(db.inserts).toEqual([
      {
        table: "communication_opt_outs",
        patient_id: "p-1",
        scope: "campaign",
        source: "unsubscribe_link",
        campaign_id: "c-1",
      },
    ]);
  });

  it("stops all emails when asked, and does not log a repeat", async () => {
    db.updated = [];
    const token = await createUnsubscribeToken(SECRET, "p-1", "c-1");
    const res = await post({ token, scope: "all" });
    expect(await res.json()).toEqual({ ok: true, scope: "all" });
    expect(db.updates[0]!.values).toEqual({ email_opt_out: true });
    expect(db.inserts).toHaveLength(0);
  });
});
