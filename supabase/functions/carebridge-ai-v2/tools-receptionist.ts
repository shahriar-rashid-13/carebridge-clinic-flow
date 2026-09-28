import {
  APPOINTMENT_COLUMNS,
  APPOINTMENT_STATUSES,
  BILL_STATUSES,
  dateRange,
  describeAppointments,
  enumArg,
  parseJsonField,
  profileNames,
  textArg,
  uuidArg,
  ToolInputError,
  type AppointmentRow,
  type ToolDefinition,
} from "./shared.ts";

export const searchPatients: ToolDefinition = {
  name: "search_patients",
  description: "Search patients by name, email, or phone. Returns at most 20 matches.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "At least 2 characters." } },
    required: ["query"],
  },
  roles: ["receptionist"],
  async run(args, ctx) {
    // Characters with meaning in PostgREST filter syntax are removed.
    const term = textArg(args, "query", 100).replace(/[,()*%\\:"]/g, " ").trim();
    if (term.length < 2) throw new ToolInputError("query must be at least 2 characters.");
    const { data, error } = await ctx.db
      .from("profiles")
      .select("id, full_name, email, phone, date_of_birth")
      .eq("role", "patient")
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
      .order("full_name", { ascending: true })
      .limit(20);
    if (error) throw new Error(`search_patients failed: ${error.message}`);
    return {
      ok: true,
      patients: (data ?? []).map((row: any) => ({
        patient_id: row.id,
        name: row.full_name,
        email: row.email,
        phone: row.phone,
        date_of_birth: row.date_of_birth,
      })),
    };
  },
};

export const getAppointments: ToolDefinition = {
  name: "get_appointments",
  description:
    "List clinic appointments in a date range (default: today plus 7 days), optionally filtered by status, doctor, or patient.",
  parameters: {
    type: "object",
    properties: {
      date_from: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      date_to: { type: "string", description: "YYYY-MM-DD. Defaults to date_from + 7 days. Max range 31 days." },
      status: { type: "string", enum: [...APPOINTMENT_STATUSES] },
      doctor_id: { type: "string" },
      patient_id: { type: "string" },
    },
  },
  roles: ["receptionist"],
  async run(args, ctx) {
    const { from, to } = dateRange(args, ctx.today, 7);
    const status = enumArg(args, "status", APPOINTMENT_STATUSES);
    const doctorId = uuidArg(args, "doctor_id", true);
    const patientId = uuidArg(args, "patient_id", true);
    let query = ctx.db
      .from("appointments")
      .select(APPOINTMENT_COLUMNS)
      .gte("appointment_date", from)
      .lte("appointment_date", to)
      .order("appointment_date", { ascending: true })
      .order("time_slot", { ascending: true })
      .limit(100);
    if (status) query = query.eq("status", status);
    if (doctorId) query = query.eq("doctor_id", doctorId);
    if (patientId) query = query.eq("patient_id", patientId);
    const { data, error } = await query;
    if (error) throw new Error(`get_appointments failed: ${error.message}`);
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

export const getUnbilledVisits: ToolDefinition = {
  name: "get_unbilled_visits",
  description: "List completed appointments that do not have a bill yet.",
  parameters: { type: "object", properties: {} },
  roles: ["receptionist"],
  async run(_args, ctx) {
    const { data: completed, error } = await ctx.db
      .from("appointments")
      .select(APPOINTMENT_COLUMNS)
      .eq("status", "completed")
      .order("appointment_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(`get_unbilled_visits appointments failed: ${error.message}`);
    const rows = (completed ?? []) as AppointmentRow[];
    if (!rows.length) return { ok: true, visits: [] };

    const { data: bills, error: billsError } = await ctx.db
      .from("bills")
      .select("appointment_id")
      .in("appointment_id", rows.map((row) => row.id));
    if (billsError) throw new Error(`get_unbilled_visits bills failed: ${billsError.message}`);
    const billed = new Set((bills ?? []).map((bill: any) => bill.appointment_id));
    const unbilled = rows.filter((row) => !billed.has(row.id));
    return {
      ok: true,
      visits: await describeAppointments(ctx.db, unbilled, { includePatient: true }),
    };
  },
};

export const getBills: ToolDefinition = {
  name: "get_bills",
  description: "List bills, newest first, optionally filtered by status or patient.",
  parameters: {
    type: "object",
    properties: {
      status: { type: "string", enum: [...BILL_STATUSES] },
      patient_id: { type: "string" },
    },
  },
  roles: ["receptionist"],
  async run(args, ctx) {
    const status = enumArg(args, "status", BILL_STATUSES);
    const patientId = uuidArg(args, "patient_id", true);
    let query = ctx.db
      .from("bills")
      .select("id, appointment_id, patient_id, amount, items, status, payment_method, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (status) query = query.eq("status", status);
    if (patientId) query = query.eq("patient_id", patientId);
    const { data, error } = await query;
    if (error) throw new Error(`get_bills failed: ${error.message}`);
    const names = await profileNames(ctx.db, (data ?? []).map((row: any) => row.patient_id));
    return {
      ok: true,
      bills: (data ?? []).map((row: any) => ({
        bill_id: row.id,
        appointment_id: row.appointment_id,
        patient_id: row.patient_id,
        patient_name: names.get(row.patient_id) ?? "Unknown",
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
