// Receives Resend delivery events and updates message_outbox. Resend cannot
// send a Supabase login, so deploy with --no-verify-jwt; the Svix signature
// (RESEND_WEBHOOK_SECRET) is the security.
import { createClient } from "npm:@supabase/supabase-js@2";
import { reportError } from "../carebridge-ai-v2/sentry.ts";
import { nextStatus, statusForEvent, verifySvix } from "./webhook.ts";

type ResendEvent = { type?: string; created_at?: string; data?: { email_id?: string } };

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST")
    return Response.json({ error: "Method not allowed." }, { status: 405 });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!url || !serviceKey || !secret)
    return Response.json({ error: "Webhook is not configured." }, { status: 500 });

  const body = await req.text();
  const headers = {
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
  };
  const verified = await verifySvix(secret, headers, body);
  if (!verified.ok) return Response.json({ error: "Invalid signature." }, { status: 401 });

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const type = event.type ?? "unknown";
  const providerId = event.data?.email_id ?? null;

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: row } = providerId
    ? await db
        .from("message_outbox")
        .select("id, status, template, appointment_id")
        .eq("provider_id", providerId)
        .maybeSingle()
    : { data: null };

  const { error: insertError } = await db.from("message_events").insert({
    svix_id: headers.id,
    outbox_id: row?.id ?? null,
    provider_id: providerId,
    event_type: type,
    payload: event,
  });
  if (insertError?.code === "23505") return Response.json({ ok: true, duplicate: true });
  if (insertError) {
    await reportError({
      message: "Webhook event insert failed",
      detail: insertError.message,
      tags: { function: "resend-webhook" },
    });
    return Response.json({ error: "Could not store the event." }, { status: 500 });
  }
  if (!row) return Response.json({ ok: true, ignored: "unknown message" });

  const incoming = statusForEvent(type);
  const status = incoming ? nextStatus(row.status, incoming) : null;
  if (!status) return Response.json({ ok: true, unchanged: row.status });

  const now = new Date().toISOString();
  await db
    .from("message_outbox")
    .update({
      status,
      updated_at: now,
      ...(status === "delivered" ? { delivered_at: event.created_at ?? now } : {}),
    })
    .eq("id", row.id);

  if (status === "bounced" || status === "complained") {
    const { data: staff } = await db.from("profiles").select("id").eq("role", "receptionist");
    if (staff?.length) {
      await db.from("notifications").insert(
        staff.map((s: { id: string }) => ({
          recipient_id: s.id,
          kind: "message_failed",
          title: status === "bounced" ? "Reminder email bounced" : "Reminder email marked as spam",
          body: `A ${String(row.template).replace(/_/g, " ")} email was ${status}. Please check the patient's email address or contact them another way.`,
          appointment_id: row.appointment_id ?? null,
        })),
      );
    }
  }
  return Response.json({ ok: true, status });
}

Deno.serve(handler);
