import type {
  Appointment,
  AppointmentStatus,
  Doctor,
  Invoice,
  InvoiceItem,
  Medication,
  Patient,
  Prescription,
} from "./types";

type Row = {
  [key: string]: unknown;
  id?: unknown;
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  gender?: unknown;
  date_of_birth?: unknown;
  blood_type?: unknown;
  allergies?: unknown;
  conditions?: unknown;
  address?: unknown;
  emergency_contact_name?: unknown;
  emergency_name?: unknown;
  emergency_contact_relation?: unknown;
  emergency_relation?: unknown;
  emergency_contact_phone?: unknown;
  emergency_phone?: unknown;
  name?: unknown;
  user_id?: unknown;
  specialization?: unknown;
  consultation_fee?: unknown;
  available_days?: unknown;
  slots?: unknown;
  status?: unknown;
  bio?: unknown;
  room?: unknown;
  patient_id?: unknown;
  doctor_id?: unknown;
  appointment_date?: unknown;
  time_slot?: unknown;
  reason?: unknown;
  notes?: unknown;
  created_at?: unknown;
  appointment_id?: unknown;
  diagnosis?: unknown;
  medicines?: unknown;
  dosage?: unknown;
  frequency?: unknown;
  duration?: unknown;
  label?: unknown;
  invoice_number?: unknown;
  amount?: unknown;
  items?: unknown;
  payment_method?: unknown;
  paid_at?: unknown;
};

const stringValue = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : value == null ? fallback : String(value);

const stringArray = (value: unknown) => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : value.split(",").map((item) => item.trim()).filter(Boolean);
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const jsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeStatus = (value: unknown): AppointmentStatus => {
  const status = stringValue(value).toLowerCase();
  if (status === "confirmed") return "Confirmed";
  if (status === "completed") return "Completed";
  if (status === "cancelled" || status === "canceled") return "Cancelled";
  return "Requested";
};

const mapMedication = (value: unknown): Medication => {
  const row = (value ?? {}) as Row;
  return {
    name: stringValue(row.name),
    dosage: stringValue(row.dosage),
    frequency: stringValue(row.frequency),
    duration: stringValue(row.duration),
  };
};

const mapInvoiceItem = (value: unknown): InvoiceItem => {
  const row = (value ?? {}) as Row;
  return {
    label: stringValue(row.label),
    amount: Number(row.amount ?? 0),
  };
};

export const mapProfileToPatient = (row: Row): Patient => ({
  id: stringValue(row.id),
  name: stringValue(row.full_name, "Unnamed patient"),
  email: stringValue(row.email),
  phone: stringValue(row.phone),
  dob: stringValue(row.date_of_birth),
  gender: stringValue(row.gender),
  bloodType: stringValue(row.blood_type),
  allergies: stringArray(row.allergies),
  conditions: stringArray(row.conditions),
  address: stringValue(row.address),
  emergency: {
    name: stringValue(row.emergency_contact_name ?? row.emergency_name),
    relation: stringValue(row.emergency_contact_relation ?? row.emergency_relation),
    phone: stringValue(row.emergency_contact_phone ?? row.emergency_phone),
  },
});

export const mapDoctor = (row: Row, profile?: Row): Doctor => ({
  id: stringValue(row.id),
  name: stringValue(profile?.full_name ?? row.name, "Unnamed doctor"),
  specialty: stringValue(row.specialization),
  fee: Number(row.consultation_fee ?? 0),
  days: stringArray(row.available_days),
  slots: stringArray(row.slots),
  active: stringValue(row.status).toLowerCase() === "active" || row.status === true,
  bio: stringValue(row.bio),
  room: stringValue(row.room),
});

export const mapAppointment = (row: Row): Appointment => ({
  id: stringValue(row.id),
  patientId: stringValue(row.patient_id),
  doctorId: stringValue(row.doctor_id),
  date: stringValue(row.appointment_date),
  slot: stringValue(row.time_slot),
  reason: stringValue(row.reason),
  notes: stringValue(row.notes),
  status: normalizeStatus(row.status),
  createdAt: stringValue(row.created_at),
});

export const mapPrescription = (row: Row): Prescription => ({
  id: stringValue(row.id),
  appointmentId: stringValue(row.appointment_id),
  patientId: stringValue(row.patient_id),
  doctorId: stringValue(row.doctor_id),
  date: stringValue(row.created_at),
  diagnosis: stringValue(row.diagnosis),
  medications: jsonArray(row.medicines).map(mapMedication),
  notes: stringValue(row.notes),
});

export const mapInvoice = (row: Row): Invoice => {
  const invoice: Invoice = {
    id: stringValue(row.invoice_number ?? row.id),
    appointmentId: stringValue(row.appointment_id),
    patientId: stringValue(row.patient_id),
    doctorId: stringValue(row.doctor_id),
    items: jsonArray(row.items).map(mapInvoiceItem),
    total: Number(row.amount ?? 0),
    status: stringValue(row.status).toLowerCase() === "paid" ? "Paid" : "Unpaid",
    issuedAt: stringValue(row.created_at),
  };
  if (row.id != null) invoice.databaseId = stringValue(row.id);
  if (row.payment_method != null) invoice.method = stringValue(row.payment_method);
  if (row.paid_at != null) invoice.paidAt = stringValue(row.paid_at);
  return invoice;
};

export const appointmentStatusValue = (status: AppointmentStatus) => status.toLowerCase();
