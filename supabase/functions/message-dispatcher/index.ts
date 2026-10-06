// Sends queued message_outbox rows through Resend. Called every minute by the
// pg_cron job 'message-dispatcher' with the Vault 'dispatcher_token', or
// manually with the service role key. Deploy with --no-verify-jwt.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { reportError } from "../carebridge-ai-v2/sentry.ts";
import { processRow, type EmailConfig, type OutboxRow } from "./email.ts";

const BATCH_SIZE = 20;
const SEND_GAP_MS = 600;

async function authorised(req: Request, db: SupabaseClient): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (serviceKey && bearer === serviceKey) return true;

  const token = req.headers.get("x-dispatcher-token");
  if (!token) return false;
  const { data, error } = await db.rpc("dispatcher_token_ok", { p_token: token });
  return !error && data === true;
}

async function notifyReceptionists(
  db: SupabaseClient,
  row: OutboxRow & { appointment_id?: string | null },
) {
  const { data: staff } = await db.from("profiles").select("id").eq("role", "receptionist");
  if (!staff?.length) return;
  await db.from("notifications").insert(
    staff.map((s: { id: string }) => ({
      recipient_id: s.id,
      kind: "message_failed",
      title: row.template === "campaign" ? "Campaign email failed" : "Reminder email failed",
      body: `A ${row.template.replace(/_/g, " ")} email could not be sent after ${row.attempts} attempt(s). Please contact the patient.`,
      appointment_id: row.appointment_id ?? null,
    })),
  );
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST")
    return Response.json({ error: "Method not allowed." }, { status: 405 });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!url || !serviceKey || !apiKey)
    return Response.json({ error: "Dispatcher is not configured." }, { status: 500 });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  if (!(await authorised(req, db))) return Response.json({ error: "Forbidden." }, { status: 403 });

  const config: EmailConfig = {
    apiKey,
    from: Deno.env.get("EMAIL_FROM") || undefined,
    sandboxTo: Deno.env.get("EMAIL_SANDBOX_TO") || undefined,
    appUrl: Deno.env.get("APP_URL") || undefined,
    functionsUrl: `${url}/functions/v1`,
    unsubscribeSecret: Deno.env.get("UNSUBSCRIBE_SECRET") || undefined,
  };

  const { data: rows, error } = await db.rpc("claim_outbox_batch", { p_limit: BATCH_SIZE });
  if (error) {
    await reportError({
      message: "Outbox claim failed",
      detail: error.message,
      tags: { function: "message-dispatcher" },
    });
    return Response.json({ error: "Could not claim the outbox batch." }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  let first = true;
  for (const row of (rows ?? []) as (OutboxRow & { appointment_id?: string | null })[]) {
    // Resend's free plan allows 2 requests per second.
    if (!first) await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    first = false;
    const update = await processRow(row, config);
    await db
      .from("message_outbox")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    counts[update.status] = (counts[update.status] ?? 0) + 1;
    if (update.status === "failed") await notifyReceptionists(db, row);
  }
  return Response.json({ claimed: rows?.length ?? 0, ...counts });
}

Deno.serve(handler);
