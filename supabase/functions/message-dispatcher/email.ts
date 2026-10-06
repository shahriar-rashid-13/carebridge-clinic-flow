import { createUnsubscribeToken } from "../unsubscribe/token.ts";

export const MAX_ATTEMPTS = 5;
const RETRY_MINUTES = [1, 5, 15, 60];
const TEST_INBOXES = new Set(["delivered", "bounced", "complained"]);
const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "CareBridge Clinic <onboarding@resend.dev>";
const DEFAULT_APP_URL = "https://carebridge-clinic-flow.vercel.app";

export type OutboxRow = {
  id: string;
  template: string;
  recipient: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  idempotency_key: string;
};

export type EmailConfig = {
  apiKey: string;
  from?: string;
  sandboxTo?: string;
  appUrl?: string;
  functionsUrl?: string;
  unsubscribeSecret?: string;
};

export type Email = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export type SendResult =
  { ok: true; providerId: string } | { ok: false; retryable: boolean; error: string };

export type RowUpdate = Record<string, unknown> & { status: string };

type Links = { unsubscribePage: string; unsubscribeOneClick: string };

// With a sandbox address, every email goes there instead of the stored
// recipient. payload.test_inbox ("delivered", "bounced", "complained") sends
// to Resend's matching test inbox so each webhook status can be shown.
export function resolveRecipient(row: OutboxRow, sandboxTo: string | undefined): string | null {
  const testInbox = row.payload["test_inbox"];
  if (typeof testInbox === "string" && TEST_INBOXES.has(testInbox))
    return `${testInbox}@resend.dev`;
  if (sandboxTo) return sandboxTo;
  return row.recipient?.trim() || null;
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function appUrl(config: EmailConfig): string {
  return (config.appUrl || DEFAULT_APP_URL).replace(/\/+$/, "");
}

export function renderEmail(row: OutboxRow, to: string, config: EmailConfig, links?: Links): Email {
  const name = str(row.payload["name"], "there");
  const sandboxNote =
    config.sandboxTo && row.recipient && to !== row.recipient
      ? `Sandbox copy. The original recipient is a synthetic test patient (${row.recipient}).`
      : "";
  const from = config.from || DEFAULT_FROM;

  if (row.template === "campaign") {
    const subject = str(row.payload["subject"], "A message from CareBridge Clinic");
    const body = str(row.payload["body"], "").replace(/\{name\}/g, name);
    const bookUrl = `${appUrl(config)}/book`;
    const footer = "You get this email because you are a CareBridge Clinic patient.";
    const text = [
      body,
      "",
      `Book a visit: ${bookUrl}`,
      "",
      footer,
      links ? `Unsubscribe from these emails: ${links.unsubscribePage}` : "",
      sandboxNote,
    ]
      .filter(Boolean)
      .join("\n");
    const html = [
      paragraphs(body),
      `<p><a href="${escapeHtml(bookUrl)}">Book a visit</a></p>`,
      `<p style="color:#666;font-size:12px">${escapeHtml(footer)}`,
      links ? ` <a href="${escapeHtml(links.unsubscribePage)}">Unsubscribe</a>` : "",
      "</p>",
      sandboxNote ? `<p style="color:#999;font-size:11px">${escapeHtml(sandboxNote)}</p>` : "",
    ].join("");
    const headers = links
      ? {
          "List-Unsubscribe": `<${links.unsubscribeOneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined;
    return { from, to, subject, html, text, ...(headers ? { headers } : {}) };
  }

  const title = str(row.payload["title"], "Appointment reminder");
  const body = str(row.payload["body"], "You have an appointment at CareBridge Clinic.");
  const footer = "CareBridge Clinic. To stop email reminders, ask reception.";
  const text = [
    `Hello ${name},`,
    "",
    body,
    "",
    "Please arrive 10 minutes early.",
    "",
    footer,
    sandboxNote,
  ]
    .filter((line, i, all) => line || all[i - 1])
    .join("\n")
    .trim();
  const html = [
    `<p>Hello ${escapeHtml(name)},</p>`,
    `<p>${escapeHtml(body)}</p>`,
    "<p>Please arrive 10 minutes early.</p>",
    `<p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>`,
    sandboxNote ? `<p style="color:#999;font-size:11px">${escapeHtml(sandboxNote)}</p>` : "",
  ].join("");
  return { from, to, subject: `CareBridge: ${title}`, html, text };
}

export async function campaignLinks(row: OutboxRow, config: EmailConfig): Promise<Links | null> {
  const patientId = row.payload["patient_id"];
  if (!config.unsubscribeSecret || !config.functionsUrl || typeof patientId !== "string")
    return null;
  const campaignId =
    typeof row.payload["campaign_id"] === "string" ? row.payload["campaign_id"] : null;
  const token = encodeURIComponent(
    await createUnsubscribeToken(config.unsubscribeSecret, patientId, campaignId),
  );
  return {
    unsubscribePage: `${appUrl(config)}/unsubscribe?token=${token}`,
    unsubscribeOneClick: `${config.functionsUrl.replace(/\/+$/, "")}/unsubscribe?token=${token}`,
  };
}

export async function sendViaResend(
  email: Email,
  idempotencyKey: string,
  apiKey: string,
): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(email),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return { ok: false, retryable: true, error: `network: ${String(error).slice(0, 200)}` };
  }

  const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (response.ok && data.id) return { ok: true, providerId: data.id };
  const retryable = response.status === 429 || response.status >= 500;
  return {
    ok: false,
    retryable,
    error: `resend ${response.status}: ${String(data.message ?? "").slice(0, 200)}`,
  };
}

export function retryDelayMinutes(attempts: number): number {
  return RETRY_MINUTES[Math.min(Math.max(attempts, 1), RETRY_MINUTES.length) - 1]!;
}

// Sends one claimed row and returns the columns to update. row.attempts
// already counts this attempt.
export async function processRow(
  row: OutboxRow,
  config: EmailConfig,
  now = new Date(),
): Promise<RowUpdate> {
  const to = resolveRecipient(row, config.sandboxTo);
  if (!to) return { status: "skipped", last_error: "no email address" };

  let links: Links | undefined;
  if (row.template === "campaign") {
    const made = await campaignLinks(row, config);
    // Campaign emails must carry a working unsubscribe link.
    if (!made) return { status: "failed", last_error: "unsubscribe link not configured" };
    links = made;
  }

  const result = await sendViaResend(
    renderEmail(row, to, config, links),
    row.idempotency_key,
    config.apiKey,
  );
  if (result.ok) {
    return {
      status: "sent",
      provider_id: result.providerId,
      delivered_to: to,
      sent_at: now.toISOString(),
      last_error: null,
    };
  }
  if (!result.retryable || row.attempts >= MAX_ATTEMPTS) {
    return { status: "failed", last_error: result.error, delivered_to: to };
  }
  const next = new Date(now.getTime() + retryDelayMinutes(row.attempts) * 60_000);
  return { status: "queued", next_attempt_at: next.toISOString(), last_error: result.error };
}
