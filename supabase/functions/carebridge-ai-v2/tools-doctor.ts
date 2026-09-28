import {
  APPOINTMENT_COLUMNS,
  APPOINTMENT_STATUSES,
  dateRange,
  describeAppointments,
  enumArg,
  parseJsonField,
  uuidArg,
  type AppointmentRow,
  type ToolDefinition,
} from "./shared.ts";

const NO_DOCTOR_RECORD = { ok: false, message: "No doctor record is linked to this account." };

export const getMySchedule: ToolDefinition = {
  name: "get_my_schedule",
  description:
    "List the signed-in doctor's appointments in a date range (default: today plus 7 days), with patient names.",
  parameters: {
    type: "object",
    properties: {
      date_from: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      date_to: { type: "string", description: "YYYY-MM-DD. Defaults to date_from + 7 days. Max range 31 days." },
      status: { type: "string", enum: [...APPOINTMENT_STATUSES] },
    },
  },
  roles: ["doctor"],
  async run(args, ctx) {
    if (!ctx.doctorId) return NO_DOCTOR_RECORD;
    const { from, to } = dateRange(args, ctx.today, 7);
    const status = enumArg(args, "status", APPOINTMENT_STATUSES);
    let query = ctx.db
      .from("appointments")
      .select(APPOINTMENT_COLUMNS)
      .eq("doctor_id", ctx.doctorId)
      .gte("appointment_date", from)
      .lte("appointment_date", to)
      .order("appointment_date", { ascending: true })
      .order("time_slot", { ascending: true })
      .limit(100);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw new Error(`get_my_schedule failed: ${error.message}`);
    return {
      ok: true,
      date_from: from,
      date_to: to,
      appointments: await describeAppointments(ctx.db, (data ?? []) as AppointmentRow[], {
        includePatient: true,
      }),
    };
  },
};

export const getPatientSummary: ToolDefinition = {
  name: "get_patient_summary",
  description:
    "Show clinical profile details for a patient who has an appointment with the signed-in doctor. Use patient_id from get_my_schedule.",
  parameters: {
    type: "object",
    properties: { patient_id: { type: "string" } },
    required: ["patient_id"],
  },
  roles: ["doctor"],
  async run(args, ctx) {
    if (!ctx.doctorId) return NO_DOCTOR_RECORD;
    const patientId = uuidArg(args, "patient_id");
    const { data, error } = await ctx.db
      .from("profiles")
      .select("id, full_name, gender, date_of_birth, blood_type, allergies, conditions, phone, role")
      .eq("id", patientId)
      .maybeSingle();
    if (error) throw new Error(`get_patient_summary failed: ${error.message}`);
    if (!data || data.role !== "patient") {
      return { ok: false, message: "Patient not found among your patients." };
    }
    const { role: _role, id: _id, ...profile } = data;
    return { ok: true, patient: profile };
  },
};

export const getPatientHistory: ToolDefinition = {
  name: "get_patient_history",
  description:
    "Show a patient's appointments with the signed-in doctor and the prescriptions this doctor wrote for them.",
  parameters: {
    type: "object",
    properties: { patient_id: { type: "string" } },
    required: ["patient_id"],
  },
  roles: ["doctor"],
  async run(args, ctx) {
    if (!ctx.doctorId) return NO_DOCTOR_RECORD;
    const patientId = uuidArg(args, "patient_id");
    const [appointments, prescriptions] = await Promise.all([
      ctx.db
        .from("appointments")
        .select(APPOINTMENT_COLUMNS)
        .eq("doctor_id", ctx.doctorId)
        .eq("patient_id", patientId)
        .order("appointment_date", { ascending: false })
        .limit(30),
      ctx.db
        .from("prescriptions")
        .select("appointment_id, diagnosis, medicines, notes, created_at")
        .eq("doctor_id", ctx.doctorId)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (appointments.error) throw new Error(`get_patient_history appointments failed: ${appointments.error.message}`);
    if (prescriptions.error) throw new Error(`get_patient_history prescriptions failed: ${prescriptions.error.message}`);
    if (!appointments.data?.length) {
      return { ok: false, message: "This patient has no appointments with you." };
    }
    return {
      ok: true,
      appointments: await describeAppointments(ctx.db, appointments.data as AppointmentRow[], {
        includePatient: false,
      }),
      prescriptions: (prescriptions.data ?? []).map((row: any) => ({
        appointment_id: row.appointment_id,
        issued_on: String(row.created_at).slice(0, 10),
        diagnosis: row.diagnosis,
        medicines: parseJsonField(row.medicines),
        notes: row.notes || null,
      })),
    };
  },
};
