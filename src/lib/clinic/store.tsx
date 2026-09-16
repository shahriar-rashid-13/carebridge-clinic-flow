import * as React from "react";
import {
  appointments as seedAppointments,
  doctors as seedDoctors,
  invoices as seedInvoices,
  patients as seedPatients,
  prescriptions as seedPrescriptions,
  today,
} from "./data";
import type {
  Appointment,
  Doctor,
  Invoice,
  InvoiceItem,
  Medication,
  Patient,
  Prescription,
  Role,
} from "./types";

/**
 * Local reactive data service. Every mutation lives here so the whole thing can be
 * swapped for a Supabase-backed implementation without touching the views.
 */
interface ClinicState {
  role: Role;
  setRole: (r: Role) => void;
  currentPatientId: string;
  currentDoctorId: string;
  setCurrentDoctorId: (id: string) => void;
  doctors: Doctor[];
  patients: Patient[];
  appointments: Appointment[];
  prescriptions: Prescription[];
  invoices: Invoice[];
  currentPatient: Patient;
  currentDoctor: Doctor;
  getDoctor: (id: string) => Doctor | undefined;
  getPatient: (id: string) => Patient | undefined;
  bookAppointment: (input: {
    patientId: string;
    doctorId: string;
    date: string;
    slot: string;
    reason: string;
    notes: string;
  }) => void;
  setAppointmentStatus: (id: string, status: Appointment["status"]) => void;
  rescheduleAppointment: (id: string, date: string, slot: string) => void;
  completeConsultation: (input: {
    appointmentId: string;
    diagnosis: string;
    medications: Medication[];
    notes: string;
  }) => void;
  upsertDoctor: (doc: Doctor) => void;
  toggleDoctorActive: (id: string) => void;
  createInvoice: (appointmentId: string, items: InvoiceItem[]) => void;
  markInvoicePaid: (id: string, method: string) => void;
  isSlotTaken: (doctorId: string, date: string, slot: string) => boolean;
}

const ClinicContext = React.createContext<ClinicState | null>(null);

let counter = 100;
const nextId = (prefix: string) => `${prefix}${++counter}`;

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = React.useState<Role>("patient");
  const [currentDoctorId, setCurrentDoctorId] = React.useState("d1");
  const [doctors, setDoctors] = React.useState<Doctor[]>(seedDoctors);
  const [patients] = React.useState<Patient[]>(seedPatients);
  const [appointments, setAppointments] = React.useState<Appointment[]>(seedAppointments);
  const [prescriptions, setPrescriptions] = React.useState<Prescription[]>(seedPrescriptions);
  const [invoices, setInvoices] = React.useState<Invoice[]>(seedInvoices);

  const currentPatientId = "p1";

  const value: ClinicState = {
    role,
    setRole,
    currentPatientId,
    currentDoctorId,
    setCurrentDoctorId,
    doctors,
    patients,
    appointments,
    prescriptions,
    invoices,
    currentPatient: patients.find((p) => p.id === currentPatientId)!,
    currentDoctor: (doctors.find((d) => d.id === currentDoctorId) ?? doctors[0])!,
    getDoctor: (id) => doctors.find((d) => d.id === id),
    getPatient: (id) => patients.find((p) => p.id === id),

    bookAppointment: (input) =>
      setAppointments((prev) => [
        {
          id: nextId("a"),
          ...input,
          status: "Requested",
          createdAt: today(),
        },
        ...prev,
      ]),

    setAppointmentStatus: (id, status) =>
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a))),

    rescheduleAppointment: (id, date, slot) =>
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, date, slot, status: "Confirmed" } : a)),
      ),

    completeConsultation: ({ appointmentId, diagnosis, medications, notes }) => {
      const appt = appointments.find((a) => a.id === appointmentId);
      if (!appt) return;
      setPrescriptions((prev) => [
        {
          id: nextId("rx"),
          appointmentId,
          patientId: appt.patientId,
          doctorId: appt.doctorId,
          date: today(),
          diagnosis,
          medications,
          notes,
        },
        ...prev,
      ]);
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? { ...a, status: "Completed" } : a)),
      );
    },

    upsertDoctor: (doc) =>
      setDoctors((prev) =>
        prev.some((d) => d.id === doc.id)
          ? prev.map((d) => (d.id === doc.id ? doc : d))
          : [...prev, doc],
      ),

    toggleDoctorActive: (id) =>
      setDoctors((prev) => prev.map((d) => (d.id === id ? { ...d, active: !d.active } : d))),

    createInvoice: (appointmentId, items) => {
      const appt = appointments.find((a) => a.id === appointmentId);
      if (!appt) return;
      setInvoices((prev) => [
        {
          id: `INV-${1043 + prev.length + 1}`,
          appointmentId,
          patientId: appt.patientId,
          doctorId: appt.doctorId,
          items,
          total: items.reduce((s, i) => s + i.amount, 0),
          status: "Unpaid",
          issuedAt: today(),
        },
        ...prev,
      ]);
    },

    markInvoicePaid: (id, method) =>
      setInvoices((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, status: "Paid", method, paidAt: today() } : i,
        ),
      ),

    isSlotTaken: (doctorId, date, slot) =>
      appointments.some(
        (a) =>
          a.doctorId === doctorId &&
          a.date === date &&
          a.slot === slot &&
          (a.status === "Requested" || a.status === "Confirmed"),
      ),
  };

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>;
}

export function useClinic() {
  const ctx = React.useContext(ClinicContext);
  if (!ctx) throw new Error("useClinic must be used inside ClinicProvider");
  return ctx;
}

export function newDoctorId() {
  return nextId("d");
}
