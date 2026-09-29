import { doctorsById, profileNames, weekdayOf, type ToolDefinition } from "./shared.ts";

const minutesLeft = (expiresAt: string) =>
  Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));

export const getMyWaitlist: ToolDefinition = {
  name: "get_my_waitlist",
  description:
    "List the signed-in patient's open waitlist entries and pending slot offers. Offers must be accepted before they expire.",
  parameters: { type: "object", properties: {} },
  roles: ["patient"],
  async run(_args, ctx) {
    const [entries, offers] = await Promise.all([
      ctx.db
        .from("waitlist")
        .select("id, doctor_id, preferred_date, preferred_slot, status, created_at")
        .eq("patient_id", ctx.userId)
        .in("status", ["waiting", "offered"])
        .order("preferred_date", { ascending: true }),
      ctx.db
        .from("waitlist_offers")
        .select("id, doctor_id, offer_date, time_slot, expires_at")
        .eq("patient_id", ctx.userId)
        .eq("status", "pending")
        .order("expires_at", { ascending: true }),
    ]);
    if (entries.error) throw new Error(`get_my_waitlist entries failed: ${entries.error.message}`);
    if (offers.error) throw new Error(`get_my_waitlist offers failed: ${offers.error.message}`);
    const doctors = await doctorsById(ctx.db, [
      ...(entries.data ?? []).map((row: any) => row.doctor_id),
      ...(offers.data ?? []).map((row: any) => row.doctor_id),
    ]);
    return {
      ok: true,
      waitlist: (entries.data ?? []).map((row: any) => ({
        waitlist_id: row.id,
        doctor: doctors.get(row.doctor_id)?.name ?? "Unknown",
        date: row.preferred_date,
        weekday: weekdayOf(row.preferred_date),
        slot: row.preferred_slot ?? "any",
        status: row.status,
      })),
      pending_offers: (offers.data ?? []).map((row: any) => ({
        offer_id: row.id,
        doctor: doctors.get(row.doctor_id)?.name ?? "Unknown",
        date: row.offer_date,
        weekday: weekdayOf(row.offer_date),
        slot: row.time_slot,
        minutes_left: minutesLeft(row.expires_at),
      })),
    };
  },
};

export const getFollowups: ToolDefinition = {
  name: "get_followups",
  description:
    "List open no-show follow-ups flagged by the clinic automations, plus the current waitlist with any pending offers.",
  parameters: { type: "object", properties: {} },
  roles: ["receptionist"],
  async run(_args, ctx) {
    const [followups, entries, offers] = await Promise.all([
      ctx.db
        .from("appointment_followups")
        .select("id, created_at, appointment:appointments(patient_id, doctor_id, appointment_date, time_slot)")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(50),
      ctx.db
        .from("waitlist")
        .select("id, patient_id, doctor_id, preferred_date, preferred_slot, status")
        .in("status", ["waiting", "offered"])
        .order("created_at", { ascending: true })
        .limit(50),
      ctx.db
        .from("waitlist_offers")
        .select("waitlist_id, time_slot, expires_at")
        .eq("status", "pending"),
    ]);
    if (followups.error) throw new Error(`get_followups failed: ${followups.error.message}`);
    if (entries.error) throw new Error(`get_followups waitlist failed: ${entries.error.message}`);
    if (offers.error) throw new Error(`get_followups offers failed: ${offers.error.message}`);

    const followupRows = (followups.data ?? []) as any[];
    const entryRows = (entries.data ?? []) as any[];
    const [doctors, patients] = await Promise.all([
      doctorsById(ctx.db, [
        ...followupRows.map((row) => row.appointment?.doctor_id),
        ...entryRows.map((row) => row.doctor_id),
      ].filter(Boolean)),
      profileNames(ctx.db, [
        ...followupRows.map((row) => row.appointment?.patient_id),
        ...entryRows.map((row) => row.patient_id),
      ].filter(Boolean)),
    ]);
    const offerByEntry = new Map((offers.data ?? []).map((row: any) => [row.waitlist_id, row]));

    return {
      ok: true,
      open_followups: followupRows.map((row) => ({
        followup_id: row.id,
        reason: "no_show",
        patient: patients.get(row.appointment?.patient_id) ?? "Unknown",
        doctor: doctors.get(row.appointment?.doctor_id)?.name ?? "Unknown",
        missed_date: row.appointment?.appointment_date ?? null,
        missed_slot: row.appointment?.time_slot ?? null,
        flagged_at: String(row.created_at).slice(0, 16),
      })),
      waitlist: entryRows.map((row) => {
        const offer = offerByEntry.get(row.id) as any;
        return {
          patient: patients.get(row.patient_id) ?? "Unknown",
          doctor: doctors.get(row.doctor_id)?.name ?? "Unknown",
          date: row.preferred_date,
          slot: row.preferred_slot ?? "any",
          status: row.status,
          ...(offer ? { offered_slot: offer.time_slot, offer_minutes_left: minutesLeft(offer.expires_at) } : {}),
        };
      }),
    };
  },
};
