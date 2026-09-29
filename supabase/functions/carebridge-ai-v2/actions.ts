import {
  APPOINTMENT_COLUMNS,
  dateArg,
  doctorsById,
  profileNames,
  textArg,
  ToolInputError,
  uuidArg,
  weekdayOf,
  type AppointmentRow,
  type Proposal,
  type Role,
  type ToolContext,
  type ToolDefinition,
} from "./shared.ts";

// Write actions never change data from a model tool call. The tool only
// creates a pending proposal; the change happens when the user presses
// Confirm, and prepare() runs again at that moment with fresh data.

type Detail = { label: string; value: string };
type Prepared = { payload: Record<string, unknown>; summary: string; details: Detail[] };
export type ActionResult = { ok: boolean; message: string };

export class ActionError extends Error {}

type ActionDefinition = {
  type: string;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
  roles: Role[];
  prepare: (args: Record<string, unknown>, ctx: ToolContext) => Promise<Prepared>;
  commit: (payload: Record<string, unknown>, ctx: ToolContext) => Promise<ActionResult>;
};

const ACTIVE_STATUSES = ["requested", "confirmed"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Stored slots mix "09:00 AM" and "09:00AM", so slots are compared normalized.
const SLOT_PATTERN = /^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i;

function normalizeSlot(value: string): string {
  const match = value.trim().match(SLOT_PATTERN);
  return match ? `${match[1]!.padStart(2, "0")}:${match[2]} ${match[3]!.toUpperCase()}` : value.trim().toUpperCase();
}

type DbError = { code?: string; message: string };

function raise(error: DbError, conflictMessage = "That conflicts with an existing record."): never {
  if (error.code === "23505") throw new ActionError(conflictMessage);
  if (error.code && ["22023", "P0002", "42501"].includes(error.code)) throw new ActionError(error.message);
  throw new Error(error.message);
}

function slotArg(args: Record<string, unknown>, key: string): string {
  const value = textArg(args, key, 20);
  if (!SLOT_PATTERN.test(value)) throw new ToolInputError(`${key} must look like "09:00 AM".`);
  return normalizeSlot(value);
}

function numberArg(args: Record<string, unknown>, key: string, max: number): number {
  const value = typeof args[key] === "string" ? Number(args[key]) : args[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new ToolInputError(`${key} must be a number greater than 0 and at most ${max}.`);
  }
  return Math.round(value * 100) / 100;
}

function arrayArg(args: Record<string, unknown>, key: string, maxItems: number): unknown[] {
  const value = args[key];
  if (!Array.isArray(value) || value.length === 0) throw new ToolInputError(`${key} must be a non-empty list.`);
  if (value.length > maxItems) throw new ToolInputError(`${key} can have at most ${maxItems} items.`);
  return value;
}

const objectItem = (value: unknown, key: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolInputError(`Each ${key} item must be an object.`);
  }
  return value as Record<string, unknown>;
};

async function loadAppointment(ctx: ToolContext, id: string): Promise<AppointmentRow> {
  const { data, error } = await ctx.db.from("appointments").select(APPOINTMENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`appointment lookup failed: ${error.message}`);
  if (!data) throw new ActionError("Appointment not found.");
  return data as AppointmentRow;
}

async function appointmentNames(ctx: ToolContext, row: AppointmentRow) {
  const [doctors, patients] = await Promise.all([
    doctorsById(ctx.db, [row.doctor_id]),
    profileNames(ctx.db, [row.patient_id]),
  ]);
  return {
    doctorName: doctors.get(row.doctor_id)?.name ?? "the doctor",
    patientName: patients.get(row.patient_id) ?? "the patient",
  };
}

const when = (date: string, slot: string) => `${weekdayOf(date)} ${date} at ${slot}`;

// Returns the doctor's name and the slot exactly as the doctor stores it when
// the slot is bookable, otherwise throws.
async function checkSlot(
  ctx: ToolContext,
  doctorId: string,
  date: string,
  slot: string,
  current?: { date: string; slot: string },
): Promise<{ doctorName: string; slot: string }> {
  if (date < ctx.today) throw new ActionError("That date is in the past.");
  if (current && current.date === date && normalizeSlot(current.slot) === slot) {
    throw new ActionError("The appointment is already at that date and time.");
  }
  const { data: doctor, error } = await ctx.db
    .from("doctors")
    .select("id, available_days, slots, status, profile:profiles!doctors_user_id_fkey(full_name)")
    .eq("id", doctorId)
    .maybeSingle();
  if (error) throw new Error(`doctor lookup failed: ${error.message}`);
  if (!doctor || doctor.status !== "active") throw new ActionError("That doctor is not available for booking.");
  const days: string[] = Array.isArray(doctor.available_days) ? doctor.available_days : [];
  const weekday = weekdayOf(date);
  if (!days.some((day) => day.slice(0, 3) === weekday)) {
    throw new ActionError(`The doctor does not work on ${weekday}. Working days: ${days.join(", ")}.`);
  }
  const slots: string[] = Array.isArray(doctor.slots) ? doctor.slots : [];
  const storedSlot = slots.find((candidate) => normalizeSlot(candidate) === slot);
  if (!storedSlot) throw new ActionError(`${slot} is not one of the doctor's slot times.`);
  const { data: taken, error: takenError } = await ctx.db.rpc("get_taken_slots", {
    p_doctor_id: doctorId,
    p_date: date,
  });
  if (takenError) throw new Error(`get_taken_slots failed: ${takenError.message}`);
  if (((taken ?? []) as string[]).some((candidate) => normalizeSlot(candidate) === slot)) {
    throw new ActionError("That slot is already booked.");
  }
  return { doctorName: (doctor as any).profile?.full_name ?? "the doctor", slot: storedSlot };
}

async function requireActive(ctx: ToolContext, id: string) {
  const row = await loadAppointment(ctx, id);
  if (!ACTIVE_STATUSES.includes(row.status)) {
    throw new ActionError(`This appointment is ${row.status} and cannot be changed.`);
  }
  return row;
}

const appointmentIdParam = { appointment_id: { type: "string", description: "Appointment ID from a read tool." } };
const rescheduleParams = {
  ...appointmentIdParam,
  new_date: { type: "string", description: "YYYY-MM-DD" },
  new_time_slot: { type: "string", description: 'Exact slot string, for example "09:00 AM".' },
};

// ---------------------------------------------------------------- patient

const bookAppointment: ActionDefinition = {
  type: "book_appointment",
  toolName: "propose_booking",
  description: "Propose booking an appointment for the signed-in patient. Check free slots with get_available_slots first.",
  parameters: {
    type: "object",
    properties: {
      doctor_id: { type: "string" },
      appointment_date: { type: "string", description: "YYYY-MM-DD" },
      time_slot: { type: "string", description: 'Exact slot string, for example "09:00 AM".' },
      reason: { type: "string", description: "Reason for the visit in the patient's words." },
    },
    required: ["doctor_id", "appointment_date", "time_slot", "reason"],
  },
  roles: ["patient"],
  async prepare(args, ctx) {
    const doctorId = uuidArg(args, "doctor_id");
    const date = dateArg(args, "appointment_date");
    const reason = textArg(args, "reason", 300);
    const { doctorName, slot } = await checkSlot(ctx, doctorId, date, slotArg(args, "time_slot"));
    return {
      payload: { doctor_id: doctorId, appointment_date: date, time_slot: slot, reason },
      summary: `Book ${doctorName} on ${when(date, slot)}`,
      details: [
        { label: "Doctor", value: doctorName },
        { label: "Date", value: `${weekdayOf(date)} ${date}` },
        { label: "Time", value: slot },
        { label: "Reason", value: reason },
      ],
    };
  },
  async commit(payload, ctx) {
    const { error } = await ctx.db.from("appointments").insert({
      patient_id: ctx.userId,
      doctor_id: payload["doctor_id"],
      appointment_date: payload["appointment_date"],
      time_slot: payload["time_slot"],
      reason: payload["reason"],
      notes: "",
      status: "requested",
    });
    if (error) raise(error, "That slot was just booked by someone else. Please choose another slot.");
    return {
      ok: true,
      message: `Your appointment request for ${when(String(payload["appointment_date"]), String(payload["time_slot"]))} is booked. The front desk will confirm it.`,
    };
  },
};

const cancelMyAppointment: ActionDefinition = {
  type: "patient_cancel_appointment",
  toolName: "propose_cancel_my_appointment",
  description: "Propose cancelling one of the signed-in patient's requested or confirmed appointments.",
  parameters: { type: "object", properties: appointmentIdParam, required: ["appointment_id"] },
  roles: ["patient"],
  async prepare(args, ctx) {
    const row = await requireActive(ctx, uuidArg(args, "appointment_id"));
    if (row.patient_id !== ctx.userId) throw new ActionError("Appointment not found.");
    const { doctorName } = await appointmentNames(ctx, row);
    return {
      payload: { appointment_id: row.id },
      summary: `Cancel your appointment with ${doctorName} on ${when(row.appointment_date, row.time_slot)}`,
      details: [
        { label: "Doctor", value: doctorName },
        { label: "Date", value: `${weekdayOf(row.appointment_date)} ${row.appointment_date}` },
        { label: "Time", value: row.time_slot },
      ],
    };
  },
  async commit(payload, ctx) {
    const { data, error } = await ctx.db
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", payload["appointment_id"])
      .eq("patient_id", ctx.userId)
      .in("status", ACTIVE_STATUSES)
      .select("id");
    if (error) raise(error);
    if (!data?.length) throw new ActionError("This appointment can no longer be cancelled.");
    return { ok: true, message: "Your appointment is cancelled." };
  },
};

const rescheduleMyAppointment: ActionDefinition = {
  type: "patient_reschedule_appointment",
  toolName: "propose_reschedule_my_appointment",
  description:
    "Propose moving one of the signed-in patient's appointments to a new free slot with the same doctor. The appointment goes back to 'requested' for the front desk to confirm.",
  parameters: { type: "object", properties: rescheduleParams, required: ["appointment_id", "new_date", "new_time_slot"] },
  roles: ["patient"],
  async prepare(args, ctx) {
    const row = await requireActive(ctx, uuidArg(args, "appointment_id"));
    if (row.patient_id !== ctx.userId) throw new ActionError("Appointment not found.");
    const date = dateArg(args, "new_date");
    const { doctorName, slot } = await checkSlot(ctx, row.doctor_id, date, slotArg(args, "new_time_slot"), {
      date: row.appointment_date,
      slot: row.time_slot,
    });
    return {
      payload: { appointment_id: row.id, new_date: date, new_time_slot: slot },
      summary: `Move your appointment with ${doctorName} to ${when(date, slot)}`,
      details: [
        { label: "Doctor", value: doctorName },
        { label: "From", value: when(row.appointment_date, row.time_slot) },
        { label: "To", value: when(date, slot) },
        { label: "New status", value: "requested (front desk confirms)" },
      ],
    };
  },
  async commit(payload, ctx) {
    const { error } = await ctx.db.rpc("patient_reschedule_appointment", {
      p_appointment_id: payload["appointment_id"],
      p_date: payload["new_date"],
      p_time_slot: payload["new_time_slot"],
    });
    if (error) raise(error, "That slot was just booked by someone else. Please choose another slot.");
    return {
      ok: true,
      message: `Your appointment is moved to ${when(String(payload["new_date"]), String(payload["new_time_slot"]))}. The front desk will confirm it.`,
    };
  },
};

// ---------------------------------------------------------------- doctor

const completeConsultation: ActionDefinition = {
  type: "complete_consultation",
  toolName: "propose_complete_consultation",
  description:
    "Propose completing one of the signed-in doctor's confirmed appointments with a diagnosis, prescribed medicines, and notes.",
  parameters: {
    type: "object",
    properties: {
      ...appointmentIdParam,
      diagnosis: { type: "string" },
      medicines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            dosage: { type: "string" },
            frequency: { type: "string" },
            duration: { type: "string" },
          },
          required: ["name"],
        },
      },
      notes: { type: "string" },
    },
    required: ["appointment_id", "diagnosis", "medicines"],
  },
  roles: ["doctor"],
  async prepare(args, ctx) {
    if (!ctx.doctorId) throw new ActionError("No doctor record is linked to this account.");
    const row = await loadAppointment(ctx, uuidArg(args, "appointment_id"));
    if (row.doctor_id !== ctx.doctorId) throw new ActionError("Appointment not found among your appointments.");
    if (row.status !== "confirmed") throw new ActionError(`Only confirmed appointments can be completed. This one is ${row.status}.`);
    const { data: existing, error } = await ctx.db
      .from("prescriptions")
      .select("id")
      .eq("appointment_id", row.id)
      .limit(1);
    if (error) throw new Error(`prescription lookup failed: ${error.message}`);
    if (existing?.length) throw new ActionError("This appointment already has a prescription.");

    const diagnosis = textArg(args, "diagnosis", 500);
    const notes = textArg(args, "notes", 1000, true);
    const medicines = (Array.isArray(args["medicines"]) ? args["medicines"] : []).slice(0, 21);
    if (medicines.length > 20) throw new ToolInputError("medicines can have at most 20 items.");
    const cleanMedicines = medicines.map((item) => {
      const medicine = objectItem(item, "medicines");
      return {
        name: textArg(medicine, "name", 100),
        dosage: textArg(medicine, "dosage", 100, true),
        frequency: textArg(medicine, "frequency", 100, true),
        duration: textArg(medicine, "duration", 100, true),
      };
    });
    const { patientName } = await appointmentNames(ctx, row);
    return {
      payload: { appointment_id: row.id, diagnosis, medicines: cleanMedicines, notes },
      summary: `Complete ${patientName}'s consultation on ${when(row.appointment_date, row.time_slot)}`,
      details: [
        { label: "Patient", value: patientName },
        { label: "Appointment", value: when(row.appointment_date, row.time_slot) },
        { label: "Diagnosis", value: diagnosis },
        {
          label: "Medicines",
          value: cleanMedicines.length
            ? cleanMedicines.map((m) => [m.name, m.dosage, m.frequency, m.duration].filter(Boolean).join(", ")).join("; ")
            : "None",
        },
        ...(notes ? [{ label: "Notes", value: notes }] : []),
      ],
    };
  },
  async commit(payload, ctx) {
    const { error } = await ctx.db.rpc("complete_consultation", {
      p_appointment_id: payload["appointment_id"],
      p_diagnosis: payload["diagnosis"],
      p_medicines: payload["medicines"],
      p_notes: payload["notes"],
    });
    if (error) raise(error, "This appointment already has a prescription.");
    return { ok: true, message: "The consultation is completed and the prescription is saved." };
  },
};

// ---------------------------------------------------------------- receptionist

const confirmAppointment: ActionDefinition = {
  type: "confirm_appointment",
  toolName: "propose_confirm_appointment",
  description: "Propose confirming a requested appointment.",
  parameters: { type: "object", properties: appointmentIdParam, required: ["appointment_id"] },
  roles: ["receptionist"],
  async prepare(args, ctx) {
    const row = await loadAppointment(ctx, uuidArg(args, "appointment_id"));
    if (row.status !== "requested") throw new ActionError(`This appointment is ${row.status}, not requested.`);
    const { doctorName, patientName } = await appointmentNames(ctx, row);
    return {
      payload: { appointment_id: row.id },
      summary: `Confirm ${patientName}'s appointment with ${doctorName} on ${when(row.appointment_date, row.time_slot)}`,
      details: [
        { label: "Patient", value: patientName },
        { label: "Doctor", value: doctorName },
        { label: "When", value: when(row.appointment_date, row.time_slot) },
      ],
    };
  },
  async commit(payload, ctx) {
    const { data, error } = await ctx.db
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", payload["appointment_id"])
      .eq("status", "requested")
      .select("id");
    if (error) raise(error);
    if (!data?.length) throw new ActionError("This appointment is no longer waiting for confirmation.");
    return { ok: true, message: "The appointment is confirmed." };
  },
};

const rescheduleAppointment: ActionDefinition = {
  type: "reschedule_appointment",
  toolName: "propose_reschedule_appointment",
  description: "Propose moving a requested or confirmed appointment to a new free slot with the same doctor. It becomes confirmed.",
  parameters: { type: "object", properties: rescheduleParams, required: ["appointment_id", "new_date", "new_time_slot"] },
  roles: ["receptionist"],
  async prepare(args, ctx) {
    const row = await requireActive(ctx, uuidArg(args, "appointment_id"));
    const date = dateArg(args, "new_date");
    const { doctorName, slot } = await checkSlot(ctx, row.doctor_id, date, slotArg(args, "new_time_slot"), {
      date: row.appointment_date,
      slot: row.time_slot,
    });
    const { patientName } = await appointmentNames(ctx, row);
    return {
      payload: { appointment_id: row.id, new_date: date, new_time_slot: slot },
      summary: `Move ${patientName}'s appointment with ${doctorName} to ${when(date, slot)}`,
      details: [
        { label: "Patient", value: patientName },
        { label: "Doctor", value: doctorName },
        { label: "From", value: when(row.appointment_date, row.time_slot) },
        { label: "To", value: when(date, slot) },
      ],
    };
  },
  async commit(payload, ctx) {
    const { data, error } = await ctx.db
      .from("appointments")
      .update({ appointment_date: payload["new_date"], time_slot: payload["new_time_slot"], status: "confirmed" })
      .eq("id", payload["appointment_id"])
      .in("status", ACTIVE_STATUSES)
      .select("id");
    if (error) raise(error, "That slot was just booked by someone else. Please choose another slot.");
    if (!data?.length) throw new ActionError("This appointment can no longer be rescheduled.");
    return { ok: true, message: "The appointment is rescheduled and confirmed." };
  },
};

const cancelAppointment: ActionDefinition = {
  type: "cancel_appointment",
  toolName: "propose_cancel_appointment",
  description: "Propose cancelling a requested or confirmed appointment.",
  parameters: { type: "object", properties: appointmentIdParam, required: ["appointment_id"] },
  roles: ["receptionist"],
  async prepare(args, ctx) {
    const row = await requireActive(ctx, uuidArg(args, "appointment_id"));
    const { doctorName, patientName } = await appointmentNames(ctx, row);
    return {
      payload: { appointment_id: row.id },
      summary: `Cancel ${patientName}'s appointment with ${doctorName} on ${when(row.appointment_date, row.time_slot)}`,
      details: [
        { label: "Patient", value: patientName },
        { label: "Doctor", value: doctorName },
        { label: "When", value: when(row.appointment_date, row.time_slot) },
      ],
    };
  },
  async commit(payload, ctx) {
    const { data, error } = await ctx.db
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", payload["appointment_id"])
      .in("status", ACTIVE_STATUSES)
      .select("id");
    if (error) raise(error);
    if (!data?.length) throw new ActionError("This appointment can no longer be cancelled.");
    return { ok: true, message: "The appointment is cancelled." };
  },
};

const createBill: ActionDefinition = {
  type: "create_bill",
  toolName: "propose_create_bill",
  description: "Propose creating an unpaid bill for a completed appointment that has no bill yet. The total is calculated from the items.",
  parameters: {
    type: "object",
    properties: {
      ...appointmentIdParam,
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { label: { type: "string" }, amount: { type: "number" } },
          required: ["label", "amount"],
        },
      },
    },
    required: ["appointment_id", "items"],
  },
  roles: ["receptionist"],
  async prepare(args, ctx) {
    const row = await loadAppointment(ctx, uuidArg(args, "appointment_id"));
    if (row.status !== "completed") throw new ActionError("Bills can only be created for completed appointments.");
    const { data: existing, error } = await ctx.db.from("bills").select("id").eq("appointment_id", row.id).limit(1);
    if (error) throw new Error(`bill lookup failed: ${error.message}`);
    if (existing?.length) throw new ActionError("This appointment already has a bill.");
    const items = arrayArg(args, "items", 10).map((item) => {
      const entry = objectItem(item, "items");
      return { label: textArg(entry, "label", 80), amount: numberArg(entry, "amount", 1_000_000) };
    });
    const total = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const { patientName, doctorName } = await appointmentNames(ctx, row);
    return {
      payload: { appointment_id: row.id, items },
      summary: `Bill ${patientName} ${total} for the visit with ${doctorName} on ${row.appointment_date}`,
      details: [
        { label: "Patient", value: patientName },
        { label: "Visit", value: `${doctorName}, ${when(row.appointment_date, row.time_slot)}` },
        ...items.map((item) => ({ label: item.label, value: String(item.amount) })),
        { label: "Total", value: String(total) },
      ],
    };
  },
  async commit(payload, ctx) {
    const row = await loadAppointment(ctx, String(payload["appointment_id"]));
    const items = payload["items"] as { label: string; amount: number }[];
    const total = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const { error } = await ctx.db.from("bills").insert({
      appointment_id: row.id,
      patient_id: row.patient_id,
      amount: total,
      items,
      status: "unpaid",
    });
    if (error) raise(error, "This appointment already has a bill.");
    return { ok: true, message: `The bill for ${total} is created and marked unpaid.` };
  },
};

const markBillPaid: ActionDefinition = {
  type: "mark_bill_paid",
  toolName: "propose_mark_bill_paid",
  description: "Propose recording a cash payment for an unpaid bill.",
  parameters: {
    type: "object",
    properties: { bill_id: { type: "string", description: "Bill ID from get_bills." } },
    required: ["bill_id"],
  },
  roles: ["receptionist"],
  async prepare(args, ctx) {
    const billId = uuidArg(args, "bill_id");
    const { data: bill, error } = await ctx.db
      .from("bills")
      .select("id, patient_id, amount, status")
      .eq("id", billId)
      .maybeSingle();
    if (error) throw new Error(`bill lookup failed: ${error.message}`);
    if (!bill) throw new ActionError("Bill not found.");
    if (bill.status !== "unpaid") throw new ActionError("This bill is already paid.");
    const names = await profileNames(ctx.db, [bill.patient_id]);
    const patientName = names.get(bill.patient_id) ?? "the patient";
    return {
      payload: { bill_id: bill.id },
      summary: `Record a cash payment of ${bill.amount} from ${patientName}`,
      details: [
        { label: "Patient", value: patientName },
        { label: "Amount", value: String(bill.amount) },
        { label: "Method", value: "cash" },
      ],
    };
  },
  async commit(payload, ctx) {
    const { data, error } = await ctx.db
      .from("bills")
      .update({ status: "paid", payment_method: "cash", paid_at: new Date().toISOString() })
      .eq("id", payload["bill_id"])
      .eq("status", "unpaid")
      .select("id");
    if (error) raise(error);
    if (!data?.length) throw new ActionError("This bill is already paid.");
    return { ok: true, message: "The payment is recorded." };
  },
};

async function requirePatientProfile(ctx: ToolContext, id: string) {
  const { data, error } = await ctx.db.from("profiles").select("id, full_name, email, role").eq("id", id).maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  if (!data) throw new ActionError("Patient not found.");
  if (data.role !== "patient") throw new ActionError(`This user is already a ${data.role}.`);
  return data as { id: string; full_name: string | null; email: string | null };
}

const promoteToReceptionist: ActionDefinition = {
  type: "promote_patient_to_receptionist",
  toolName: "propose_promote_to_receptionist",
  description: "Propose promoting a patient account to receptionist. Use search_patients to find the patient_id.",
  parameters: { type: "object", properties: { patient_id: { type: "string" } }, required: ["patient_id"] },
  roles: ["receptionist"],
  async prepare(args, ctx) {
    const profile = await requirePatientProfile(ctx, uuidArg(args, "patient_id"));
    const name = profile.full_name ?? profile.email ?? "this patient";
    return {
      payload: { patient_id: profile.id },
      summary: `Promote ${name} to receptionist`,
      details: [
        { label: "User", value: name },
        { label: "Email", value: profile.email ?? "-" },
        { label: "New role", value: "receptionist" },
      ],
    };
  },
  async commit(payload, ctx) {
    const { error } = await ctx.db.rpc("promote_patient_to_receptionist", { p_target_profile_id: payload["patient_id"] });
    if (error) raise(error);
    return { ok: true, message: "The user is now a receptionist." };
  },
};

const promoteToDoctor: ActionDefinition = {
  type: "promote_patient_to_doctor",
  toolName: "propose_promote_to_doctor",
  description: "Propose promoting a patient account to doctor with a specialization, fee, working days, and slot times.",
  parameters: {
    type: "object",
    properties: {
      patient_id: { type: "string" },
      specialization: { type: "string" },
      consultation_fee: { type: "number" },
      available_days: { type: "array", items: { type: "string", enum: WEEKDAYS } },
      slots: { type: "array", items: { type: "string", description: 'For example "09:00 AM".' } },
      room: { type: "string" },
      bio: { type: "string" },
    },
    required: ["patient_id", "specialization", "consultation_fee", "available_days", "slots"],
  },
  roles: ["receptionist"],
  async prepare(args, ctx) {
    const profile = await requirePatientProfile(ctx, uuidArg(args, "patient_id"));
    const specialization = textArg(args, "specialization", 100);
    const fee = numberArg(args, "consultation_fee", 1_000_000);
    const days = [...new Set(arrayArg(args, "available_days", 7).map(String))];
    if (days.some((day) => !WEEKDAYS.includes(day))) throw new ToolInputError(`available_days must use ${WEEKDAYS.join(", ")}.`);
    const rawSlots = arrayArg(args, "slots", 40).map(String);
    if (rawSlots.some((slot) => !SLOT_PATTERN.test(slot.trim()))) throw new ToolInputError('slots must look like "09:00 AM".');
    const slots = [...new Set(rawSlots.map(normalizeSlot))];
    const room = textArg(args, "room", 50, true);
    const bio = textArg(args, "bio", 500, true);
    const name = profile.full_name ?? profile.email ?? "this patient";
    return {
      payload: { patient_id: profile.id, specialization, consultation_fee: fee, available_days: days, slots, room, bio },
      summary: `Promote ${name} to doctor (${specialization})`,
      details: [
        { label: "User", value: name },
        { label: "Specialization", value: specialization },
        { label: "Fee", value: String(fee) },
        { label: "Days", value: days.join(", ") },
        { label: "Slots", value: slots.join(", ") },
        ...(room ? [{ label: "Room", value: room }] : []),
      ],
    };
  },
  async commit(payload, ctx) {
    const { error } = await ctx.db.rpc("promote_patient_to_doctor", {
      p_target_profile_id: payload["patient_id"],
      p_specialization: payload["specialization"],
      p_consultation_fee: payload["consultation_fee"],
      p_available_days: payload["available_days"],
      p_slots: payload["slots"],
      p_active: true,
      p_bio: payload["bio"],
      p_room: payload["room"],
    });
    if (error) raise(error);
    return { ok: true, message: "The user is now a doctor." };
  },
};

// ---------------------------------------------------------------- automations

const joinWaitlist: ActionDefinition = {
  type: "join_waitlist",
  toolName: "propose_join_waitlist",
  description:
    "Propose adding the signed-in patient to the waitlist for a doctor on a date, optionally for one taken slot. When a matching slot is cancelled it is offered to them automatically. Use only when the wanted slot or day is fully booked.",
  parameters: {
    type: "object",
    properties: {
      doctor_id: { type: "string" },
      date: { type: "string", description: "YYYY-MM-DD" },
      time_slot: { type: "string", description: 'Optional taken slot to wait for, for example "02:30 PM". Omit for any slot that day.' },
      reason: { type: "string", description: "Reason for the visit in the patient's words." },
    },
    required: ["doctor_id", "date"],
  },
  roles: ["patient"],
  async prepare(args, ctx) {
    const doctorId = uuidArg(args, "doctor_id");
    const date = dateArg(args, "date");
    if (date < ctx.today) throw new ActionError("That date is in the past.");
    const wanted = args["time_slot"] ? slotArg(args, "time_slot") : null;
    const reason = textArg(args, "reason", 300, true);
    const { data: doctor, error } = await ctx.db
      .from("doctors")
      .select("id, available_days, slots, status, profile:profiles!doctors_user_id_fkey(full_name)")
      .eq("id", doctorId)
      .maybeSingle();
    if (error) throw new Error(`doctor lookup failed: ${error.message}`);
    if (!doctor || doctor.status !== "active") throw new ActionError("That doctor is not available.");
    const weekday = weekdayOf(date);
    if (!(doctor.available_days ?? []).some((day: string) => day.slice(0, 3) === weekday)) {
      throw new ActionError(`The doctor does not work on ${weekday}.`);
    }
    let slot: string | null = null;
    if (wanted) {
      slot = (doctor.slots ?? []).find((candidate: string) => normalizeSlot(candidate) === wanted) ?? null;
      if (!slot) throw new ActionError(`${wanted} is not one of the doctor's slot times.`);
    }
    const doctorName = (doctor as any).profile?.full_name ?? "the doctor";
    return {
      payload: { doctor_id: doctorId, date, time_slot: slot, reason },
      summary: `Join the waitlist for ${doctorName} on ${weekday} ${date}${slot ? ` at ${slot}` : ""}`,
      details: [
        { label: "Doctor", value: doctorName },
        { label: "Date", value: `${weekday} ${date}` },
        { label: "Slot", value: slot ?? "Any slot that day" },
        ...(reason ? [{ label: "Reason", value: reason }] : []),
      ],
    };
  },
  async commit(payload, ctx) {
    const { error } = await ctx.db.rpc("join_waitlist", {
      p_doctor_id: payload["doctor_id"],
      p_date: payload["date"],
      p_slot: payload["time_slot"] ?? null,
      p_reason: payload["reason"] ?? "",
    });
    if (error) raise(error);
    return {
      ok: true,
      message: "You are on the waitlist. If a matching slot is cancelled, you will get an offer in your notifications.",
    };
  },
};

const acceptWaitlistOffer: ActionDefinition = {
  type: "accept_waitlist_offer",
  toolName: "propose_accept_waitlist_offer",
  description: "Propose accepting one of the signed-in patient's pending waitlist offers. Find the offer_id with get_my_waitlist.",
  parameters: {
    type: "object",
    properties: { offer_id: { type: "string", description: "Offer ID from get_my_waitlist." } },
    required: ["offer_id"],
  },
  roles: ["patient"],
  async prepare(args, ctx) {
    const { data: offer, error } = await ctx.db
      .from("waitlist_offers")
      .select("id, doctor_id, offer_date, time_slot, status, expires_at")
      .eq("id", uuidArg(args, "offer_id"))
      .maybeSingle();
    if (error) throw new Error(`offer lookup failed: ${error.message}`);
    if (!offer) throw new ActionError("Offer not found.");
    if (offer.status !== "pending") throw new ActionError(`This offer is already ${offer.status}.`);
    if (new Date(offer.expires_at).getTime() <= Date.now()) throw new ActionError("This offer has expired.");
    const doctorName = (await doctorsById(ctx.db, [offer.doctor_id])).get(offer.doctor_id)?.name ?? "the doctor";
    return {
      payload: { offer_id: offer.id },
      summary: `Accept the ${doctorName} slot on ${when(offer.offer_date, offer.time_slot)}`,
      details: [
        { label: "Doctor", value: doctorName },
        { label: "When", value: when(offer.offer_date, offer.time_slot) },
        {
          label: "Offer expires in",
          value: `${Math.max(1, Math.ceil((new Date(offer.expires_at).getTime() - Date.now()) / 60_000))} min`,
        },
        { label: "New status", value: "requested (front desk confirms)" },
      ],
    };
  },
  async commit(payload, ctx) {
    const { error } = await ctx.db.rpc("accept_waitlist_offer", { p_offer_id: payload["offer_id"] });
    if (error) raise(error, "Sorry, that slot was just taken.");
    return { ok: true, message: "The slot is booked. The front desk will confirm it." };
  },
};

const resolveFollowup: ActionDefinition = {
  type: "resolve_followup",
  toolName: "propose_resolve_followup",
  description: "Propose resolving an open no-show follow-up with a short note. Find the followup_id with get_followups.",
  parameters: {
    type: "object",
    properties: {
      followup_id: { type: "string", description: "Follow-up ID from get_followups." },
      note: { type: "string", description: "What was done, for example 'Called patient, rebooked for Friday'." },
    },
    required: ["followup_id"],
  },
  roles: ["receptionist"],
  async prepare(args, ctx) {
    const { data: followup, error } = await ctx.db
      .from("appointment_followups")
      .select("id, appointment_id, status")
      .eq("id", uuidArg(args, "followup_id"))
      .maybeSingle();
    if (error) throw new Error(`follow-up lookup failed: ${error.message}`);
    if (!followup) throw new ActionError("Follow-up not found.");
    if (followup.status !== "open") throw new ActionError("This follow-up is already resolved.");
    const note = textArg(args, "note", 500, true);
    const row = await loadAppointment(ctx, followup.appointment_id);
    const { doctorName, patientName } = await appointmentNames(ctx, row);
    return {
      payload: { followup_id: followup.id, note },
      summary: `Resolve the no-show follow-up for ${patientName} (${when(row.appointment_date, row.time_slot)})`,
      details: [
        { label: "Patient", value: patientName },
        { label: "Missed visit", value: `${doctorName}, ${when(row.appointment_date, row.time_slot)}` },
        { label: "Note", value: note || "-" },
      ],
    };
  },
  async commit(payload, ctx) {
    const { error } = await ctx.db.rpc("resolve_followup", {
      p_followup_id: payload["followup_id"],
      p_note: payload["note"] ?? "",
    });
    if (error) raise(error);
    return { ok: true, message: "The follow-up is resolved." };
  },
};

const ACTIONS: ActionDefinition[] = [
  joinWaitlist,
  acceptWaitlistOffer,
  resolveFollowup,
  bookAppointment,
  cancelMyAppointment,
  rescheduleMyAppointment,
  completeConsultation,
  confirmAppointment,
  rescheduleAppointment,
  cancelAppointment,
  createBill,
  markBillPaid,
  promoteToReceptionist,
  promoteToDoctor,
];

export const proposalTools: ToolDefinition[] = ACTIONS.map((action) => ({
  name: action.toolName,
  description: `${action.description} This only creates a proposal card. Nothing changes until the user presses Confirm on the card.`,
  parameters: action.parameters,
  roles: action.roles,
  async run(args, ctx) {
    let prepared: Prepared;
    try {
      prepared = await action.prepare(args, ctx);
    } catch (err) {
      if (err instanceof ActionError) return { ok: false, message: err.message };
      throw err;
    }
    const { data, error } = await ctx.db.rpc("ai_create_pending_action", {
      p_action_type: action.type,
      p_payload: prepared.payload,
      p_summary: prepared.summary,
      p_details: prepared.details,
    });
    if (error) throw new Error(`ai_create_pending_action failed: ${error.message}`);
    ctx.proposals.push(data as Proposal);
    return {
      ok: true,
      status: "awaiting_user_confirmation",
      summary: prepared.summary,
      instruction: "Tell the user to review the proposal card and press Confirm. Do not say the action is done.",
    };
  },
}));

// Runs a confirmed proposal. prepare() re-validates the stored payload against
// current data, because the payload may be stale or may not come from the model.
export async function executeAction(
  row: { action_type: string; role: string; payload: Record<string, unknown> },
  ctx: ToolContext,
): Promise<ActionResult> {
  const action = ACTIONS.find((candidate) => candidate.type === row.action_type);
  if (!action || !action.roles.includes(ctx.role) || row.role !== ctx.role) {
    return { ok: false, message: "This action is not allowed for your account." };
  }
  try {
    const fresh = await action.prepare(row.payload ?? {}, ctx);
    return await action.commit(fresh.payload, ctx);
  } catch (err) {
    if (err instanceof ActionError || err instanceof ToolInputError) return { ok: false, message: err.message };
    throw err;
  }
}
