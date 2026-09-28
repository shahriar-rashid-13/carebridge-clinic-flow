import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Role = "patient" | "doctor" | "receptionist";
export const ROLES: Role[] = ["patient", "doctor", "receptionist"];

export type ToolContext = {
  db: SupabaseClient;
  userId: string;
  role: Role;
  doctorId: string | null;
  today: string;
};

export type ToolResult = Record<string, unknown>;

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  roles: Role[];
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

export class ToolInputError extends Error {}

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

const present = (args: Record<string, unknown>, key: string) =>
  args[key] !== undefined && args[key] !== null && args[key] !== "";

export function uuidArg(args: Record<string, unknown>, key: string): string;
export function uuidArg(args: Record<string, unknown>, key: string, optional: true): string | null;
export function uuidArg(args: Record<string, unknown>, key: string, optional = false) {
  if (!present(args, key)) {
    if (optional) return null;
    throw new ToolInputError(`${key} is required.`);
  }
  if (!isUuid(args[key])) throw new ToolInputError(`${key} must be a valid ID.`);
  return args[key];
}

export function dateArg(args: Record<string, unknown>, key: string): string;
export function dateArg(args: Record<string, unknown>, key: string, optional: true): string | null;
export function dateArg(args: Record<string, unknown>, key: string, optional = false) {
  if (!present(args, key)) {
    if (optional) return null;
    throw new ToolInputError(`${key} is required.`);
  }
  if (!isIsoDate(args[key])) throw new ToolInputError(`${key} must be a real date in YYYY-MM-DD format.`);
  return args[key];
}

export function enumArg<T extends string>(
  args: Record<string, unknown>,
  key: string,
  values: readonly T[],
): T | null {
  if (!present(args, key)) return null;
  if (!values.includes(args[key] as T)) {
    throw new ToolInputError(`${key} must be one of: ${values.join(", ")}.`);
  }
  return args[key] as T;
}

export function textArg(args: Record<string, unknown>, key: string, max: number): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new ToolInputError(`${key} is required.`);
  if (value.trim().length > max) throw new ToolInputError(`${key} must be at most ${max} characters.`);
  return value.trim();
}

export const boolArg = (args: Record<string, unknown>, key: string) => args[key] === true;

export const APPOINTMENT_STATUSES = ["requested", "confirmed", "completed", "cancelled"] as const;
export const BILL_STATUSES = ["unpaid", "paid"] as const;
export const MAX_RANGE_DAYS = 31;

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function weekdayOf(date: string): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(`${date}T12:00:00Z`).getUTCDay()
  ]!;
}

export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function dateRange(
  args: Record<string, unknown>,
  today: string,
  defaultDays: number,
): { from: string; to: string } {
  const from = dateArg(args, "date_from", true) ?? today;
  const to = dateArg(args, "date_to", true) ?? addDays(from, defaultDays);
  if (to < from) throw new ToolInputError("date_to must be on or after date_from.");
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    throw new ToolInputError(`Date range must be at most ${MAX_RANGE_DAYS} days.`);
  }
  return { from, to };
}

type DoctorSummary = { name: string; specialization: string | null; room: string | null; consultation_fee: number | null };

export async function doctorsById(db: SupabaseClient, ids: string[]): Promise<Map<string, DoctorSummary>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await db
    .from("doctors")
    .select("id, specialization, consultation_fee, room, profile:profiles!doctors_user_id_fkey(full_name)")
    .in("id", unique);
  if (error) throw new Error(`doctors lookup failed: ${error.message}`);
  return new Map(
    (data ?? []).map((row: any) => [
      row.id,
      {
        name: row.profile?.full_name ?? "CareBridge doctor",
        specialization: row.specialization ?? null,
        room: row.room ?? null,
        consultation_fee: row.consultation_fee ?? null,
      },
    ]),
  );
}

export async function profileNames(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await db.from("profiles").select("id, full_name").in("id", unique);
  if (error) throw new Error(`profiles lookup failed: ${error.message}`);
  return new Map((data ?? []).map((row: any) => [row.id, row.full_name ?? "Unknown"]));
}

export function parseJsonField(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export type AppointmentRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  time_slot: string;
  reason: string | null;
  notes: string | null;
  status: string;
};

export const APPOINTMENT_COLUMNS =
  "id, patient_id, doctor_id, appointment_date, time_slot, reason, notes, status";

export async function describeAppointments(
  db: SupabaseClient,
  rows: AppointmentRow[],
  options: { includePatient: boolean },
) {
  const [doctors, patients] = await Promise.all([
    doctorsById(db, rows.map((row) => row.doctor_id)),
    options.includePatient ? profileNames(db, rows.map((row) => row.patient_id)) : Promise.resolve(null),
  ]);
  return rows.map((row) => {
    const doctor = doctors.get(row.doctor_id);
    return {
      appointment_id: row.id,
      date: row.appointment_date,
      time_slot: row.time_slot,
      status: row.status,
      reason: row.reason,
      notes: row.notes || null,
      doctor_id: row.doctor_id,
      doctor_name: doctor?.name ?? "CareBridge doctor",
      specialization: doctor?.specialization ?? null,
      room: doctor?.room ?? null,
      ...(patients
        ? { patient_id: row.patient_id, patient_name: patients.get(row.patient_id) ?? "Unknown" }
        : {}),
    };
  });
}
