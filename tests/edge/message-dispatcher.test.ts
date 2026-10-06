// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ATTEMPTS,
  processRow,
  renderEmail,
  resolveRecipient,
  retryDelayMinutes,
  type OutboxRow,
} from "../../supabase/functions/message-dispatcher/email.ts";

const fetchMock = vi.fn<typeof fetch>();
const NOW = new Date("2026-10-06T06:00:00Z");

function row(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: "row-1",
    template: "reminder_24h",
    recipient: "rahim@example.test",
    payload: {
      name: "Rahim",
      title: "Appointment reminder",
      body: "You see Dr Karim on Wed 07 Oct at 10:00 AM.",
    },
    attempts: 1,
    idempotency_key: "reminder_24h:appt-1",
    ...overrides,
  };
}

function resendReply(status: number, body: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("resolveRecipient", () => {
  it("redirects to the sandbox address", () => {
    expect(resolveRecipient(row(), "me@inbox.test")).toBe("me@inbox.test");
  });

  it("uses a Resend test inbox when the payload asks for one", () => {
    expect(resolveRecipient(row({ payload: { test_inbox: "bounced" } }), "me@inbox.test")).toBe(
      "bounced@resend.dev",
    );
  });

  it("ignores unknown test inbox names", () => {
    expect(resolveRecipient(row({ payload: { test_inbox: "anyone" } }), "me@inbox.test")).toBe(
      "me@inbox.test",
    );
  });

  it("uses the stored recipient without a sandbox", () => {
    expect(resolveRecipient(row(), undefined)).toBe("rahim@example.test");
    expect(resolveRecipient(row({ recipient: "  " }), undefined)).toBeNull();
  });
});

describe("renderEmail", () => {
  it("escapes HTML and notes the sandbox redirect", () => {
    const email = renderEmail(
      row({ payload: { name: "<b>Rahim</b>", body: "Room 3 & 4" } }),
      "me@inbox.test",
      {
        apiKey: "re_test",
        sandboxTo: "me@inbox.test",
      },
    );
    expect(email.html).toContain("&lt;b&gt;Rahim&lt;/b&gt;");
    expect(email.html).toContain("Room 3 &amp; 4");
    expect(email.html).not.toContain("<b>Rahim</b>");
    expect(email.text).toContain("Sandbox copy");
    expect(email.from).toBe("CareBridge Clinic <onboarding@resend.dev>");
    expect(email.subject).toBe("CareBridge: Appointment reminder");
  });
});

describe("processRow", () => {
  const config = { apiKey: "re_test", sandboxTo: "me@inbox.test" };

  it("marks the row sent and passes the idempotency key", async () => {
    resendReply(200, { id: "msg_123" });
    const update = await processRow(row(), config, NOW);
    expect(update).toMatchObject({
      status: "sent",
      provider_id: "msg_123",
      delivered_to: "me@inbox.test",
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init!.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "reminder_24h:appt-1",
    );
    expect(JSON.parse(init!.body as string).to).toBe("me@inbox.test");
  });

  it("requeues retryable errors with backoff", async () => {
    resendReply(429, { message: "Too many requests" });
    const update = await processRow(row({ attempts: 2 }), config, NOW);
    expect(update.status).toBe("queued");
    expect(update["next_attempt_at"]).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString());
  });

  it("requeues network errors", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const update = await processRow(row(), config, NOW);
    expect(update.status).toBe("queued");
    expect(String(update["last_error"])).toContain("network");
  });

  it("fails at once on a validation error", async () => {
    resendReply(422, { message: "Invalid to field" });
    const update = await processRow(row(), config, NOW);
    expect(update).toMatchObject({ status: "failed", last_error: "resend 422: Invalid to field" });
  });

  it("fails after the last attempt", async () => {
    resendReply(500, { message: "Server error" });
    const update = await processRow(row({ attempts: MAX_ATTEMPTS }), config, NOW);
    expect(update.status).toBe("failed");
  });

  it("skips rows with no address and no sandbox", async () => {
    const update = await processRow(row({ recipient: null }), { apiKey: "re_test" }, NOW);
    expect(update.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("campaign emails", () => {
  const campaignRow = row({
    template: "campaign",
    idempotency_key: "campaign:c-1:p-1",
    payload: {
      name: "Rahim",
      subject: "Time for your check-up",
      body: "Hello {name},\n\nIt has been a while since your last visit.",
      campaign_id: "c-1",
      patient_id: "p-1",
    },
  });
  const config = {
    apiKey: "re_test",
    sandboxTo: "me@inbox.test",
    appUrl: "https://app.test/",
    functionsUrl: "https://db.test/functions/v1",
    unsubscribeSecret: "test-secret",
  };

  it("renders the subject, name, booking link and one-click unsubscribe headers", async () => {
    resendReply(200, { id: "msg_c1" });
    const update = await processRow(campaignRow, config, NOW);
    expect(update.status).toBe("sent");
    const email = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(email.subject).toBe("Time for your check-up");
    expect(email.text).toContain("Hello Rahim,");
    expect(email.text).toContain("https://app.test/book");
    expect(email.text).toMatch(/https:\/\/app\.test\/unsubscribe\?token=/);
    expect(email.headers["List-Unsubscribe"]).toMatch(
      /^<https:\/\/db\.test\/functions\/v1\/unsubscribe\?token=.+>$/,
    );
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("refuses to send a campaign without an unsubscribe link", async () => {
    const update = await processRow(
      campaignRow,
      { apiKey: "re_test", sandboxTo: "me@inbox.test" },
      NOW,
    );
    expect(update).toMatchObject({
      status: "failed",
      last_error: "unsubscribe link not configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps reminder emails free of list headers", () => {
    const email = renderEmail(row(), "me@inbox.test", config);
    expect(email.headers).toBeUndefined();
  });
});

describe("retryDelayMinutes", () => {
  it("grows with each attempt and caps at one hour", () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMinutes)).toEqual([1, 5, 15, 60, 60, 60]);
  });
});
