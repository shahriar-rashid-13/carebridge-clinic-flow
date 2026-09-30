import type { Row } from "./memory-db";

export const SARAH_ID = "11111111-1111-4111-8111-111111111111";
export const MARCUS_USER_ID = "22222222-2222-4222-8222-222222222222";
export const CLARA_ID = "33333333-3333-4333-8333-333333333333";
export const TOM_ID = "44444444-4444-4444-8444-444444444444";
export const MARCUS_DOCTOR_ID = "55555555-5555-4555-8555-555555555555";

export const clinicRows = (): Record<string, Row[]> => ({
  profiles: [
    { id: SARAH_ID, full_name: "Sarah Jenkins", email: "sarah@example.com", role: "patient" },
    { id: TOM_ID, full_name: "Tom Baker", email: "tom@example.com", role: "patient" },
    {
      id: MARCUS_USER_ID,
      full_name: "Dr. Marcus Vance",
      email: "marcus@example.com",
      role: "doctor",
    },
    { id: CLARA_ID, full_name: "Clara Morgan", email: "clara@example.com", role: "receptionist" },
  ],
  doctors: [
    {
      id: MARCUS_DOCTOR_ID,
      user_id: MARCUS_USER_ID,
      specialization: "Cardiology",
      consultation_fee: 80,
      available_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      slots: ["09:00 AM", "10:00 AM", "11:00 AM"],
      status: "active",
      bio: "Heart doctor",
      room: "201",
      profile: { id: MARCUS_USER_ID, full_name: "Dr. Marcus Vance" },
    },
  ],
  appointments: [
    {
      id: "a-requested",
      patient_id: SARAH_ID,
      doctor_id: MARCUS_DOCTOR_ID,
      appointment_date: "2026-10-05",
      time_slot: "09:00 AM",
      reason: "Chest pain",
      notes: "",
      status: "requested",
      created_at: "2026-09-28T09:00:00.000Z",
    },
    {
      id: "a-cancelled",
      patient_id: TOM_ID,
      doctor_id: MARCUS_DOCTOR_ID,
      appointment_date: "2026-10-05",
      time_slot: "10:00 AM",
      reason: "Checkup",
      notes: "",
      status: "cancelled",
      created_at: "2026-09-28T09:00:00.000Z",
    },
    {
      id: "a-completed",
      patient_id: SARAH_ID,
      doctor_id: MARCUS_DOCTOR_ID,
      appointment_date: "2026-09-20",
      time_slot: "11:00 AM",
      reason: "Follow up",
      notes: "",
      status: "completed",
      created_at: "2026-09-15T09:00:00.000Z",
    },
  ],
  prescriptions: [
    {
      id: "rx-1",
      appointment_id: "a-completed",
      patient_id: SARAH_ID,
      doctor_id: MARCUS_DOCTOR_ID,
      diagnosis: "Mild hypertension",
      medicines: "[]",
      notes: "",
      created_at: "2026-09-20T12:00:00.000Z",
    },
  ],
  bills: [
    {
      id: "bill-uuid-1",
      invoice_number: "INV-1001",
      appointment_id: "a-completed",
      patient_id: SARAH_ID,
      amount: 80,
      items: [{ label: "Consultation", amount: 80 }],
      status: "unpaid",
      created_at: "2026-09-20T12:00:00.000Z",
    },
  ],
});

export const authFor = (role: "patient" | "doctor" | "receptionist") => {
  const people = {
    patient: { id: SARAH_ID, name: "Sarah Jenkins", email: "sarah@example.com" },
    doctor: { id: MARCUS_USER_ID, name: "Dr. Marcus Vance", email: "marcus@example.com" },
    receptionist: { id: CLARA_ID, name: "Clara Morgan", email: "clara@example.com" },
  };
  const person = people[role];
  return {
    user: { ...person, role },
    profile: { id: person.id, full_name: person.name, role },
    session: null,
    profileError: null,
    isAuthenticated: true,
    isSigningOut: false,
    loading: false,
    isLoading: false,
  };
};
