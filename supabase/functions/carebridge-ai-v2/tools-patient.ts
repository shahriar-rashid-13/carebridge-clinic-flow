import {
  APPOINTMENT_COLUMNS,
  APPOINTMENT_STATUSES,
  BILL_STATUSES,
  boolArg,
  describeAppointments,
  doctorsById,
  enumArg,
  parseJsonField,
  type AppointmentRow,
  type ToolDefinition,
} from "./shared.ts";

export const getMyAppointments: ToolDefinition = {
  name: "get_my_appointments",
  description: "List the signed-in patient's own appointments, newest first.",
  parameters: {
    type: "object",
    properties: {
      status: { type: "string", enum: [...APPOINTMENT_STATUSES] },
      upcoming_only: { type: "boolean", description: "Only appointments from today onward." },
    },
  },
  roles: ["patient"],
  async run(args, ctx) {
    const status = enumArg(args, "status", APPOINTMENT_STATUSES);
    let query = ctx.db
      .from("appointments")
      .select(APPOINTMENT_COLUMNS)
      .eq("patient_id", ctx.userId)
      .order("appointment_date", { ascending: false })
      .limit(50);
    if (status) query = query.eq("status", status);
    if (boolArg(args, "upcoming_only")) query = query.gte("appointment_date", ctx.today);
    const { data, error } = await query;
    if (error) throw new Error(`get_my_appointments failed: ${error.message}`);
    return {
      ok: true,
      appointments: await describeAppointments(ctx.db, (data ?? []) as AppointmentRow[], {
        includePatient: false,
      }),
    };
  },
};

export const getMyPrescriptions: ToolDefinition = {
  name: "get_my_prescriptions",
  description: "List the signed-in patient's own prescriptions, newest first.",
  parameters: { type: "object", properties: {} },
  roles: ["patient"],
  async run(_args, ctx) {
    const { data, error } = await ctx.db
      .from("prescriptions")
      .select("id, appointment_id, doctor_id, diagnosis, medicines, notes, created_at")
      .eq("patient_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(`get_my_prescriptions failed: ${error.message}`);
    const doctors = await doctorsById(ctx.db, (data ?? []).map((row: any) => row.doctor_id));
    return {
      ok: true,
      prescriptions: (data ?? []).map((row: any) => ({
        issued_on: String(row.created_at).slice(0, 10),
        doctor_name: doctors.get(row.doctor_id)?.name ?? "CareBridge doctor",
        diagnosis: row.diagnosis,
        medicines: parseJsonField(row.medicines),
        notes: row.notes || null,
      })),
    };
  },
};

export const getMyProfile: ToolDefinition = {
  name: "get_my_profile",
  description: "Show the signed-in user's own profile.",
  parameters: { type: "object", properties: {} },
  roles: ["patient", "doctor", "receptionist"],
  async run(_args, ctx) {
    const { data, error } = await ctx.db
      .from("profiles")
      .select(
        "full_name, email, phone, gender, date_of_birth, blood_type, allergies, conditions, address, emergency_contact_name, emergency_contact_relation, emergency_contact_phone",
      )
      .eq("id", ctx.userId)
      .maybeSingle();
    if (error) throw new Error(`get_my_profile failed: ${error.message}`);
    if (!data) return { ok: false, message: "Profile not found." };
    return { ok: true, profile: data };
  },
};

export const getMyBills: ToolDefinition = {
  name: "get_my_bills",
  description: "List the signed-in patient's own bills, newest first.",
  parameters: {
    type: "object",
    properties: { status: { type: "string", enum: [...BILL_STATUSES] } },
  },
  roles: ["patient"],
  async run(args, ctx) {
    const status = enumArg(args, "status", BILL_STATUSES);
    let query = ctx.db
      .from("bills")
      .select("id, appointment_id, amount, items, status, payment_method, paid_at, created_at")
      .eq("patient_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw new Error(`get_my_bills failed: ${error.message}`);
    return {
      ok: true,
      bills: (data ?? []).map((row: any) => ({
        bill_id: row.id,
        issued_on: String(row.created_at).slice(0, 10),
        amount: row.amount,
        items: parseJsonField(row.items),
        status: row.status,
        payment_method: row.payment_method ?? null,
        paid_at: row.paid_at ?? null,
      })),
    };
  },
};
