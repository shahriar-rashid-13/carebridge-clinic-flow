// Works the calendar_jobs queue against the clinic's Google Calendar. Called
// every minute by the pg_cron job 'calendar-sync' with the Vault
// 'dispatcher_token', or manually with the service role key. Deploy with
// --no-verify-jwt.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { reportError } from "../carebridge-ai-v2/sentry.ts";
import {
  getAccessToken,
  parseServiceAccount,
  processJob,
  type Appointment,
  type CalendarJob,
} from "./google.ts";

const BATCH_SIZE = 20;

async function authorised(req: Request, db: SupabaseClient): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (serviceKey && bearer === serviceKey) return true;

  const token = req.headers.get("x-dispatcher-token");
  if (!token) return false;
  const { data, error } = await db.rpc("dispatcher_token_ok", { p_token: token });
  return !error && data === true;
}

export async function loadAppointment(db: SupabaseClient, id: string): Promise<Appointment | null> {
  const { data: appt } = await db
    .from("appointments")
    .select("id, status, appointment_date, time_slot, reason, patient_id, doctor_id")
    .eq("id", id)
    .maybeSingle();
  if (!appt) return null;
  const { data: doctor } = await db
    .from("doctors")
    .select("user_id, specialization, room")
    .eq("id", appt.doctor_id)
    .maybeSingle();
  const ids = [appt.patient_id, doctor?.user_id].filter(Boolean);
  const { data: people } = await db.from("profiles").select("id, full_name").in("id", ids);
  const name = (pid: string | undefined) =>
    people?.find((p: { id: string }) => p.id === pid)?.full_name ?? "Unknown";
  return {
    id: appt.id,
    status: appt.status,
    appointment_date: appt.appointment_date,
    time_slot: appt.time_slot,
    reason: appt.reason,
    patient_name: name(appt.patient_id),
    doctor_name: name(doctor?.user_id),
    specialization: doctor?.specialization ?? "General",
    room: doctor?.room ?? null,
  };
}

async function notifyReceptionists(db: SupabaseClient, job: CalendarJob, error: unknown) {
  const { data: staff } = await db.from("profiles").select("id").eq("role", "receptionist");
  if (!staff?.length) return;
  await db.from("notifications").insert(
    staff.map((s: { id: string }) => ({
      recipient_id: s.id,
      kind: "message_failed",
      title: "Calendar sync failed",
      body: `The doctor calendar could not be updated after ${job.attempts} attempt(s): ${String(error ?? "").slice(0, 120)}`,
      appointment_id: job.action === "delete" ? null : job.appointment_id,
    })),
  );
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST")
    return Response.json({ error: "Method not allowed." }, { status: 405 });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID");
  const account = parseServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));
  if (!url || !serviceKey || !calendarId || !account)
    return Response.json({ error: "Calendar sync is not configured." }, { status: 500 });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  if (!(await authorised(req, db))) return Response.json({ error: "Forbidden." }, { status: 403 });

  const { data: jobs, error } = await db.rpc("claim_calendar_jobs", { p_limit: BATCH_SIZE });
  if (error) {
    await reportError({
      message: "Calendar claim failed",
      detail: error.message,
      tags: { function: "calendar-sync" },
    });
    return Response.json({ error: "Could not claim calendar jobs." }, { status: 500 });
  }
  if (!jobs?.length) return Response.json({ claimed: 0 });

  let token: string;
  try {
    token = await getAccessToken(account);
  } catch (tokenError) {
    // Put the jobs back; they are retried on the next run.
    await db
      .from("calendar_jobs")
      .update({
        status: "queued",
        last_error: String(tokenError).slice(0, 200),
        updated_at: new Date().toISOString(),
      })
      .in(
        "id",
        jobs.map((j: CalendarJob) => j.id),
      );
    await reportError({
      message: "Google token request failed",
      detail: String(tokenError),
      tags: { function: "calendar-sync" },
    });
    return Response.json({ error: "Could not sign in to Google." }, { status: 502 });
  }

  const counts: Record<string, number> = {};
  for (const job of jobs as CalendarJob[]) {
    const appointment =
      job.action === "upsert" ? await loadAppointment(db, job.appointment_id) : null;
    const update = await processJob(job, appointment, calendarId, token);
    const { error: updateError } = await db
      .from("calendar_jobs")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", job.id);
    // A newer change for the same appointment is already queued.
    if (updateError?.code === "23505") {
      await db
        .from("calendar_jobs")
        .update({
          status: "skipped",
          last_error: "superseded by a newer change",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
    counts[update.status] = (counts[update.status] ?? 0) + 1;
    if (update.status === "failed") await notifyReceptionists(db, job, update["last_error"]);
  }
  return Response.json({ claimed: jobs.length, ...counts });
}

Deno.serve(handler);
