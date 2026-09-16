export type Role = "patient" | "doctor" | "receptionist";

export type AppointmentStatus = "Requested" | "Confirmed" | "Completed" | "Cancelled";

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  fee: number;
  days: string[];
  slots: string[];
  active: boolean;
  bio: string;
  room: string;
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface Patient {
  id: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  bloodType: string;
  allergies: string[];
  conditions: string[];
  address: string;
  emergency: EmergencyContact;
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  date: string;
  slot: string;
  reason: string;
  notes: string;
  status: AppointmentStatus;
  createdAt: string;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface Prescription {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  date: string;
  diagnosis: string;
  medications: Medication[];
  notes: string;
}

export interface InvoiceItem {
  label: string;
  amount: number;
}

export interface Invoice {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  items: InvoiceItem[];
  total: number;
  status: "Unpaid" | "Paid";
  method?: string;
  issuedAt: string;
  paidAt?: string;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
