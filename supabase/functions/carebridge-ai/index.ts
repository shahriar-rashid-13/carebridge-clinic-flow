import { createClient } from "npm:@supabase/supabase-js@2";
import { AI_MODEL_CONFIG } from "./model-config.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const obj = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};
const string = (value: unknown, max = 500) =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max
    ? value.trim()
    : null;
const confirmed = (message: string) =>
  /^(yes|confirm|confirmed|please confirm|go ahead|book it|do it)[!.\s]*$/i.test(message.trim());
type Client = ReturnType<typeof createClient>;
type History = { role: "user" | "assistant"; content: string };
type ClinicRole = "patient" | "doctor" | "receptionist";
type BookingProposal = {
  doctorId: string;
  appointmentDate: string;
  timeSlot: string;
  reason: string;
};

const patientTools = [
  {
    type: "function",
    function: {
      name: "get_doctors",
      description: "List active CareBridge doctors.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_available_slots",
      description: "Get available slots for a doctor on a date.",
      parameters: {
        type: "object",
        properties: { doctor_id: { type: "string" }, appointment_date: { type: "string" } },
        required: ["doctor_id", "appointment_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_appointments",
      description: "Get the authenticated patient's appointments.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_prescriptions",
      description: "Get the authenticated patient's prescriptions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_profile",
      description: "Get the authenticated patient's profile.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "Book only after the patient explicitly confirms the exact proposed appointment.",
      parameters: {
        type: "object",
        properties: {
          doctor_id: { type: "string" },
          appointment_date: { type: "string" },
          time_slot: { type: "string" },
          reason: { type: "string" },
        },
        required: ["doctor_id", "appointment_date", "time_slot", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancel an appointment owned by the authenticated patient.",
      parameters: {
        type: "object",
        properties: { appointment_id: { type: "string" } },
        required: ["appointment_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description: "Reschedule an appointment owned by the authenticated patient.",
      parameters: {
        type: "object",
        properties: {
          appointment_id: { type: "string" },
          appointment_date: { type: "string" },
          time_slot: { type: "string" },
        },
        required: ["appointment_id", "appointment_date", "time_slot"],
      },
    },
  },
];

const doctorTools = [
  {
    type: "function",
    function: {
      name: "get_today_schedule",
      description: "Get the authenticated doctor's appointments for today.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_patient_summary",
      description: "Get a concise summary for a patient assigned to the authenticated doctor.",
      parameters: {
        type: "object",
        properties: { patient_id: { type: "string" } },
        required: ["patient_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_patient_history",
      description:
        "Get appointment and prescription history for a patient assigned to the authenticated doctor.",
      parameters: {
        type: "object",
        properties: { patient_id: { type: "string" } },
        required: ["patient_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_prescription",
      description:
        "Create a prescription from the doctor's supplied clinical decisions for the doctor's appointment.",
      parameters: {
        type: "object",
        properties: {
          appointment_id: { type: "string" },
          diagnosis: { type: "string" },
          medicines: { type: "array", items: { type: "object" } },
          notes: { type: "string" },
        },
        required: ["appointment_id", "diagnosis", "medicines", "notes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_consultation",
      description:
        "Mark an appointment owned by the authenticated doctor completed only after its prescription exists.",
      parameters: {
        type: "object",
        properties: { appointment_id: { type: "string" } },
        required: ["appointment_id"],
      },
    },
  },
];

const receptionistTools = [
  {
    type: "function",
    function: {
      name: "search_patients",
      description: "Search patient profiles by name, email, or phone.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_appointments",
      description:
        "Get clinic appointments, optionally filtered by date, status, doctor, or patient.",
      parameters: {
        type: "object",
        properties: {
          appointment_date: { type: "string" },
          status: { type: "string" },
          doctor_id: { type: "string" },
          patient_id: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_appointment",
      description: "Confirm a requested appointment.",
      parameters: {
        type: "object",
        properties: { appointment_id: { type: "string" } },
        required: ["appointment_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description: "Reschedule an appointment after checking the doctor's availability.",
      parameters: {
        type: "object",
        properties: {
          appointment_id: { type: "string" },
          appointment_date: { type: "string" },
          time_slot: { type: "string" },
        },
        required: ["appointment_id", "appointment_date", "time_slot"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancel an appointment.",
      parameters: {
        type: "object",
        properties: { appointment_id: { type: "string" } },
        required: ["appointment_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "promote_patient_to_doctor",
      description:
        "Promote an existing patient to doctor through the clinic's secure promotion RPC.",
      parameters: {
        type: "object",
        properties: {
          profile_id: { type: "string" },
          specialization: { type: "string" },
          consultation_fee: { type: "number" },
          available_days: { type: "array", items: { type: "string" } },
          slots: { type: "array", items: { type: "string" } },
          active: { type: "boolean" },
          bio: { type: "string" },
          room: { type: "string" },
        },
        required: [
          "profile_id",
          "specialization",
          "consultation_fee",
          "available_days",
          "slots",
          "active",
          "bio",
          "room",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_invoice",
      description:
        "Create a bill for a completed appointment with receptionist-supplied items and amount.",
      parameters: {
        type: "object",
        properties: {
          appointment_id: { type: "string" },
          amount: { type: "number" },
          items: { type: "array", items: { type: "object" } },
        },
        required: ["appointment_id", "amount", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_invoice_paid",
      description: "Mark an unpaid bill paid by cash.",
      parameters: {
        type: "object",
        properties: {
          bill_id: { type: "string" },
          payment_method: { type: "string", enum: ["cash"] },
        },
        required: ["bill_id", "payment_method"],
      },
    },
  },
];

const toolsFor = (role: ClinicRole) =>
  role === "patient" ? patientTools : role === "doctor" ? doctorTools : receptionistTools;

const systemFor = (role: ClinicRole) => {
  const shared =
    "Use tools for clinic data and never invent records, availability, appointment status, prescriptions, invoices, or patient information. Never claim a write succeeded until its tool result says it did. Format answers as concise Markdown with each list item on its own line.";
  if (role === "patient")
    return `${shared} You are CareBridge AI for a patient. Never access another patient's data. For booking, collect doctor, date, slot, and reason, check availability, restate the exact details, and ask for confirmation. When proposing a booking, append this exact marker on its own line: <carebridge-booking-proposal>{"doctor_id":"UUID","appointment_date":"YYYY-MM-DD","time_slot":"exact slot","reason":"exact reason"}</carebridge-booking-proposal>. Call book_appointment only when the latest user message is explicit confirmation and the immediately preceding assistant message contains an exact matching proposal.`;
  if (role === "doctor")
    return `${shared} You are CareBridge AI for an authenticated doctor. Use doctor tools only. Do not disclose patient information unless returned by a tool. The doctor is responsible for diagnosis and prescribing: structure only the doctor's supplied clinical decisions; never independently diagnose or invent medications.`;
  return `${shared} You are CareBridge AI for an authenticated receptionist. Use receptionist tools only, avoid unnecessary sensitive medical information, and use the promotion tool rather than directly changing roles or doctor records.`;
};

function proposedBooking(history: History[]): BookingProposal | null {
  const proposalMessage = history.at(-2);
  if (proposalMessage?.role !== "assistant") return null;
  const match = proposalMessage.content.match(
    /<carebridge-booking-proposal>(\{[\s\S]*?\})<\/carebridge-booking-proposal>/,
  );
  if (!match) return null;
  try {
    const proposal = JSON.parse(match[1]);
    if (
      !obj(proposal) ||
      !uuid(proposal.doctor_id) ||
      !validDate(proposal.appointment_date) ||
      !string(proposal.time_slot, 80) ||
      !string(proposal.reason)
    )
      return null;
    return {
      doctorId: proposal.doctor_id,
      appointmentDate: proposal.appointment_date,
      timeSlot: string(proposal.time_slot, 80)!,
      reason: string(proposal.reason)!,
    };
  } catch {
    return null;
  }
}

async function doctorsById(db: Client, ids: string[]) {
  if (!ids.length) return new Map();
  const { data } = await db
    .from("doctors")
    .select(
      "id, specialization, consultation_fee, room, profile:profiles!doctors_user_id_fkey(full_name)",
    )
    .in("id", ids);
  return new Map(
    (data ?? []).map((row: any) => [
      row.id,
      {
        name: row.profile?.full_name ?? "CareBridge doctor",
        specialization: row.specialization,
        room: row.room,
        consultation_fee: row.consultation_fee,
      },
    ]),
  );
}

async function patientsById(db: Client, ids: string[]) {
  if (!ids.length) return new Map();
  const { data } = await db.from("profiles").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((row: any) => [row.id, row.full_name ?? "CareBridge patient"]));
}

async function doctorIdForUser(db: Client, userId: string) {
  const { data, error } = await db.from("doctors").select("id").eq("user_id", userId).maybeSingle();
  return error || !data?.id ? null : (data.id as string);
}

const medicineList = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;
  const medicines = value.map((medicine) => {
    if (!obj(medicine)) return null;
    const name = string(medicine.name, 160);
    const dosage = string(medicine.dosage, 160);
    const frequency = string(medicine.frequency, 160);
    const duration = string(medicine.duration, 160);
    return name && dosage && frequency && duration ? { name, dosage, frequency, duration } : null;
  });
  return medicines.every(Boolean) ? medicines : null;
};

const stringList = (value: unknown, maxItems: number, itemMax: number) =>
  Array.isArray(value) && value.length > 0 && value.length <= maxItems
    ? value.map((item) => string(item, itemMax)).every(Boolean)
      ? value.map((item) => string(item, itemMax)!)
      : null
    : null;

async function slots(db: Client, doctorId: string, appointmentDate: string, excludeId?: string) {
  const { data: doctor, error } = await db
    .from("doctors")
    .select("id, available_days, slots, status")
    .eq("id", doctorId)
    .maybeSingle();
  if (error || !doctor || doctor.status !== "active")
    return { ok: false, message: "That doctor is not available for booking." };
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(`${appointmentDate}T12:00:00`).getDay()
  ];
  if (!Array.isArray(doctor.available_days) || !doctor.available_days.includes(weekday))
    return { ok: true, slots: [] as string[] };
  const { data: taken, error: takenError } = await db
    .from("appointments")
    .select("id, time_slot")
    .eq("doctor_id", doctorId)
    .eq("appointment_date", appointmentDate)
    .neq("status", "cancelled");
  if (takenError) return { ok: false, message: "Availability could not be checked." };
  const occupied = new Set(
    (taken ?? []).filter((item: any) => item.id !== excludeId).map((item: any) => item.time_slot),
  );
  return {
    ok: true,
    slots: (Array.isArray(doctor.slots) ? doctor.slots : []).filter(
      (slot: unknown): slot is string => typeof slot === "string" && !occupied.has(slot),
    ),
  };
}

async function runTool(
  name: string,
  args: unknown,
  db: Client,
  userId: string,
  role: ClinicRole,
  lastMessage: string,
  history: History[],
) {
  const fail = (message: string) => ({ ok: false, message });
  const input = obj(args) ? args : {};
  const allowed = toolsFor(role).some((tool) => tool.function.name === name);
  if (!allowed) return fail("That action is not available for your clinic role.");

  if (role === "doctor") {
    const doctorId = await doctorIdForUser(db, userId);
    if (!doctorId) return fail("Your doctor record is not available.");
    if (name === "get_today_schedule") {
      const appointmentDate = new Date().toISOString().slice(0, 10);
      const { data, error } = await db
        .from("appointments")
        .select("id, patient_id, appointment_date, time_slot, reason, notes, status")
        .eq("doctor_id", doctorId)
        .eq("appointment_date", appointmentDate)
        .order("time_slot");
      if (error) return fail("Today's schedule could not be retrieved.");
      const patients = await patientsById(db, [
        ...new Set((data ?? []).map((item: any) => item.patient_id)),
      ]);
      return {
        ok: true,
        appointments: (data ?? []).map((item: any) => ({
          ...item,
          patient_name: patients.get(item.patient_id) ?? "CareBridge patient",
        })),
      };
    }
    if (name === "get_patient_summary" || name === "get_patient_history") {
      if (!uuid(input.patient_id)) return fail("A valid patient is required.");
      const { data: relationship, error: relationshipError } = await db
        .from("appointments")
        .select("id")
        .eq("doctor_id", doctorId)
        .eq("patient_id", input.patient_id)
        .limit(1);
      if (relationshipError || !relationship?.length)
        return fail("That patient is not available to you.");
      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select(
          "id, full_name, email, phone, gender, date_of_birth, blood_type, allergies, conditions, emergency_contact_name, emergency_contact_relation, emergency_contact_phone",
        )
        .eq("id", input.patient_id)
        .maybeSingle();
      if (profileError || !profile) return fail("The patient summary could not be retrieved.");
      if (name === "get_patient_summary") {
        const { data: context, error } = await db
          .from("appointments")
          .select("id, appointment_date, time_slot, reason, notes, status")
          .eq("doctor_id", doctorId)
          .eq("patient_id", input.patient_id)
          .order("appointment_date", { ascending: false })
          .limit(5);
        return error
          ? fail("The patient summary could not be retrieved.")
          : { ok: true, patient: profile, appointments: context ?? [] };
      }
      const [appointmentsResult, prescriptionsResult] = await Promise.all([
        db
          .from("appointments")
          .select("id, appointment_date, time_slot, reason, notes, status")
          .eq("doctor_id", doctorId)
          .eq("patient_id", input.patient_id)
          .order("appointment_date", { ascending: false })
          .limit(20),
        db
          .from("prescriptions")
          .select("id, appointment_id, diagnosis, medicines, notes, created_at")
          .eq("doctor_id", doctorId)
          .eq("patient_id", input.patient_id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      return appointmentsResult.error || prescriptionsResult.error
        ? fail("The patient history could not be retrieved.")
        : {
            ok: true,
            patient: { id: profile.id, full_name: profile.full_name },
            appointments: appointmentsResult.data ?? [],
            prescriptions: prescriptionsResult.data ?? [],
          };
    }
    if (name === "create_prescription") {
      const diagnosis = string(input.diagnosis, 1000);
      const notes =
        typeof input.notes === "string" && input.notes.trim().length <= 4000
          ? input.notes.trim()
          : null;
      const medicines = medicineList(input.medicines);
      if (!uuid(input.appointment_id) || !diagnosis || notes === null || !medicines)
        return fail("A valid appointment, diagnosis, medicines, and notes are required.");
      const { data: appointment, error: appointmentError } = await db
        .from("appointments")
        .select("id, patient_id, status")
        .eq("id", input.appointment_id)
        .eq("doctor_id", doctorId)
        .maybeSingle();
      if (appointmentError || !appointment || appointment.status !== "confirmed")
        return fail("That confirmed appointment is not available for prescribing.");
      const { data: existing, error: existingError } = await db
        .from("prescriptions")
        .select("id")
        .eq("appointment_id", appointment.id)
        .maybeSingle();
      if (existingError) return fail("The prescription could not be checked.");
      if (existing) return fail("This appointment already has a prescription.");
      const { data, error } = await db
        .from("prescriptions")
        .insert({
          appointment_id: appointment.id,
          doctor_id: doctorId,
          patient_id: appointment.patient_id,
          diagnosis,
          notes,
          medicines: JSON.stringify(medicines),
        })
        .select("id, appointment_id, diagnosis, medicines, notes, created_at")
        .single();
      return error
        ? fail(
            (error as any).code === "23505"
              ? "This appointment already has a prescription."
              : "The prescription could not be created.",
          )
        : { ok: true, prescription: data };
    }
    if (name === "complete_consultation") {
      if (!uuid(input.appointment_id)) return fail("A valid appointment is required.");
      const { data: appointment, error: appointmentError } = await db
        .from("appointments")
        .select("id, status")
        .eq("id", input.appointment_id)
        .eq("doctor_id", doctorId)
        .maybeSingle();
      if (appointmentError || !appointment || appointment.status !== "confirmed")
        return fail("That confirmed appointment is not available for completion.");
      const { data: prescription, error: prescriptionError } = await db
        .from("prescriptions")
        .select("id")
        .eq("appointment_id", appointment.id)
        .maybeSingle();
      if (prescriptionError || !prescription)
        return fail("A prescription is required before completing this consultation.");
      const { data, error } = await db
        .from("appointments")
        .update({ status: "completed" })
        .eq("id", appointment.id)
        .eq("doctor_id", doctorId)
        .select("id, status")
        .single();
      return error
        ? fail("The consultation could not be completed.")
        : { ok: true, appointment: data };
    }
  }

  if (role === "receptionist") {
    if (name === "search_patients") {
      const query = string(input.query, 120);
      if (!query) return fail("A patient search query is required.");
      const pattern = `%${query.replace(/[,%]/g, " ")}%`;
      const { data, error } = await db
        .from("profiles")
        .select("id, full_name, email, phone, gender, date_of_birth")
        .eq("role", "patient")
        .or(`full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
        .limit(20);
      return error ? fail("Patients could not be retrieved.") : { ok: true, patients: data ?? [] };
    }
    if (name === "get_appointments") {
      if (input.appointment_date !== undefined && !validDate(input.appointment_date))
        return fail("The appointment date is invalid.");
      if (input.doctor_id !== undefined && !uuid(input.doctor_id))
        return fail("The doctor is invalid.");
      if (input.patient_id !== undefined && !uuid(input.patient_id))
        return fail("The patient is invalid.");
      const statuses = ["requested", "confirmed", "completed", "cancelled"];
      if (
        input.status !== undefined &&
        (typeof input.status !== "string" || !statuses.includes(input.status))
      )
        return fail("The appointment status is invalid.");
      let query: any = db
        .from("appointments")
        .select("id, patient_id, doctor_id, appointment_date, time_slot, reason, status")
        .order("appointment_date", { ascending: false })
        .limit(100);
      if (input.appointment_date) query = query.eq("appointment_date", input.appointment_date);
      if (input.status) query = query.eq("status", input.status);
      if (input.doctor_id) query = query.eq("doctor_id", input.doctor_id);
      if (input.patient_id) query = query.eq("patient_id", input.patient_id);
      const { data, error } = await query;
      if (error) return fail("Appointments could not be retrieved.");
      const [patients, doctors] = await Promise.all([
        patientsById(db, [...new Set((data ?? []).map((item: any) => item.patient_id))]),
        doctorsById(db, [...new Set((data ?? []).map((item: any) => item.doctor_id))]),
      ]);
      return {
        ok: true,
        appointments: (data ?? []).map((item: any) => ({
          ...item,
          patient_name: patients.get(item.patient_id) ?? "CareBridge patient",
          doctor: doctors.get(item.doctor_id),
        })),
      };
    }
    if (name === "confirm_appointment") {
      if (!uuid(input.appointment_id)) return fail("A valid appointment is required.");
      const { data: appointment, error: lookupError } = await db
        .from("appointments")
        .select("id, status")
        .eq("id", input.appointment_id)
        .maybeSingle();
      if (lookupError || !appointment || appointment.status !== "requested")
        return fail("That appointment cannot be confirmed.");
      const { data, error } = await db
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("id", appointment.id)
        .eq("status", "requested")
        .select("id, appointment_date, time_slot, status")
        .single();
      return error
        ? fail("The appointment could not be confirmed.")
        : { ok: true, appointment: data };
    }
    if (name === "reschedule_appointment") {
      if (
        !uuid(input.appointment_id) ||
        !validDate(input.appointment_date) ||
        !string(input.time_slot, 80)
      )
        return fail("A valid appointment, date, and time slot are required.");
      const { data: appointment, error: lookupError } = await db
        .from("appointments")
        .select("id, doctor_id, status")
        .eq("id", input.appointment_id)
        .maybeSingle();
      if (lookupError || !appointment || !["requested", "confirmed"].includes(appointment.status))
        return fail("That appointment cannot be rescheduled.");
      const available = await slots(
        db,
        appointment.doctor_id,
        input.appointment_date,
        appointment.id,
      );
      if (!available.ok || !available.slots.includes(input.time_slot))
        return fail("That new slot is not available.");
      const { data, error } = await db
        .from("appointments")
        .update({
          appointment_date: input.appointment_date,
          time_slot: input.time_slot,
          status: "confirmed",
        })
        .eq("id", appointment.id)
        .select("id, appointment_date, time_slot, status")
        .single();
      return error
        ? fail(
            (error as any).code === "23505"
              ? "That slot was just booked by someone else."
              : "The appointment could not be rescheduled.",
          )
        : { ok: true, appointment: data };
    }
    if (name === "cancel_appointment") {
      if (!uuid(input.appointment_id)) return fail("A valid appointment is required.");
      const { data: appointment, error: lookupError } = await db
        .from("appointments")
        .select("id, status")
        .eq("id", input.appointment_id)
        .maybeSingle();
      if (lookupError || !appointment || !["requested", "confirmed"].includes(appointment.status))
        return fail("That appointment cannot be cancelled.");
      const { error } = await db
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appointment.id);
      return error
        ? fail("The appointment could not be cancelled.")
        : { ok: true, cancelled_appointment_id: appointment.id };
    }
    if (name === "promote_patient_to_doctor") {
      const days = stringList(input.available_days, 7, 12),
        slotValues = stringList(input.slots, 30, 80);
      if (
        !uuid(input.profile_id) ||
        !string(input.specialization, 160) ||
        typeof input.consultation_fee !== "number" ||
        !Number.isFinite(input.consultation_fee) ||
        input.consultation_fee <= 0 ||
        !days ||
        !slotValues ||
        typeof input.active !== "boolean" ||
        (typeof input.bio !== "string" && input.bio !== undefined) ||
        (typeof input.room !== "string" && input.room !== undefined)
      )
        return fail("Valid doctor promotion details are required.");
      const { data, error } = await db.rpc("promote_patient_to_doctor", {
        p_target_profile_id: input.profile_id,
        p_specialization: string(input.specialization, 160),
        p_consultation_fee: input.consultation_fee,
        p_available_days: days,
        p_slots: slotValues,
        p_active: input.active,
        p_bio: typeof input.bio === "string" ? input.bio.trim() : "",
        p_room: typeof input.room === "string" ? input.room.trim() : "",
      });
      return error
        ? fail("The patient could not be promoted to doctor.")
        : { ok: true, doctor: data };
    }
    if (name === "create_invoice") {
      const amount = input.amount;
      if (
        !uuid(input.appointment_id) ||
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !Array.isArray(input.items) ||
        input.items.length === 0 ||
        input.items.length > 30
      )
        return fail("A valid completed appointment, amount, and bill items are required.");
      const { data: appointment, error: appointmentError } = await db
        .from("appointments")
        .select("id, patient_id, status")
        .eq("id", input.appointment_id)
        .maybeSingle();
      if (appointmentError || !appointment || appointment.status !== "completed")
        return fail("A bill can only be created for a completed appointment.");
      const { data, error } = await db
        .from("bills")
        .insert({
          appointment_id: appointment.id,
          patient_id: appointment.patient_id,
          amount,
          items: input.items,
          status: "unpaid",
        })
        .select("id, appointment_id, patient_id, amount, items, status, created_at")
        .single();
      return error ? fail("The bill could not be created.") : { ok: true, bill: data };
    }
    if (name === "mark_invoice_paid") {
      if (!uuid(input.bill_id) || input.payment_method !== "cash")
        return fail("A valid bill and cash payment method are required.");
      const { data: bill, error: lookupError } = await db
        .from("bills")
        .select("id, status")
        .eq("id", input.bill_id)
        .maybeSingle();
      if (lookupError || !bill || bill.status !== "unpaid")
        return fail("That bill cannot be marked paid.");
      const { data, error } = await db
        .from("bills")
        .update({ status: "paid", payment_method: "cash", paid_at: new Date().toISOString() })
        .eq("id", bill.id)
        .eq("status", "unpaid")
        .select("id, status, payment_method, paid_at")
        .single();
      return error ? fail("The payment could not be recorded.") : { ok: true, bill: data };
    }
  }

  const patientId = userId;
  if (name === "get_doctors") {
    const { data, error } = await db
      .from("doctors")
      .select(
        "id, specialization, consultation_fee, room, profile:profiles!doctors_user_id_fkey(full_name)",
      )
      .eq("status", "active");
    return error
      ? fail("Doctors could not be retrieved.")
      : {
          ok: true,
          doctors: (data ?? []).map((row: any) => ({
            id: row.id,
            name: row.profile?.full_name ?? "CareBridge doctor",
            specialization: row.specialization,
            consultation_fee: row.consultation_fee,
            room: row.room,
          })),
        };
  }
  if (name === "get_available_slots") {
    if (!uuid(input.doctor_id) || !validDate(input.appointment_date))
      return fail("A valid doctor and date are required.");
    return slots(db, input.doctor_id, input.appointment_date);
  }
  if (name === "get_my_appointments") {
    const { data, error } = await db
      .from("appointments")
      .select("id, doctor_id, appointment_date, time_slot, reason, status")
      .eq("patient_id", patientId)
      .order("appointment_date");
    if (error) return fail("Appointments could not be retrieved.");
    const doctors = await doctorsById(db, [...new Set((data ?? []).map((x: any) => x.doctor_id))]);
    return {
      ok: true,
      appointments: (data ?? []).map((x: any) => ({
        id: x.id,
        appointment_date: x.appointment_date,
        time_slot: x.time_slot,
        reason: x.reason,
        status: x.status,
        doctor: doctors.get(x.doctor_id),
      })),
    };
  }
  if (name === "get_my_prescriptions") {
    const { data, error } = await db
      .from("prescriptions")
      .select("id, doctor_id, diagnosis, medicines, notes, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    if (error) return fail("Prescriptions could not be retrieved.");
    const doctors = await doctorsById(db, [...new Set((data ?? []).map((x: any) => x.doctor_id))]);
    return {
      ok: true,
      prescriptions: (data ?? []).map((x: any) => ({
        id: x.id,
        issued_at: x.created_at,
        doctor: doctors.get(x.doctor_id),
        diagnosis: x.diagnosis,
        medicines: x.medicines,
        notes: x.notes,
      })),
    };
  }
  if (name === "get_my_profile") {
    const { data, error } = await db
      .from("profiles")
      .select(
        "full_name, email, phone, gender, date_of_birth, blood_type, allergies, conditions, address, emergency_contact_name, emergency_contact_relation, emergency_contact_phone",
      )
      .eq("id", patientId)
      .maybeSingle();
    return error || !data
      ? fail("Your profile could not be retrieved.")
      : { ok: true, profile: data };
  }
  if (name === "book_appointment") {
    if (!confirmed(lastMessage))
      return fail("Booking requires explicit confirmation after the details are presented.");
    const reason = string(input.reason);
    if (
      !uuid(input.doctor_id) ||
      !validDate(input.appointment_date) ||
      !string(input.time_slot, 80) ||
      !reason
    )
      return fail("Valid doctor, date, time slot, and reason are required.");
    const proposal = proposedBooking(history);
    if (
      !proposal ||
      proposal.doctorId !== input.doctor_id ||
      proposal.appointmentDate !== input.appointment_date ||
      proposal.timeSlot !== input.time_slot ||
      proposal.reason !== reason
    )
      return fail("The confirmed booking does not match the previously proposed appointment.");
    const available = await slots(db, input.doctor_id, input.appointment_date);
    if (!available.ok || !available.slots.includes(input.time_slot))
      return fail("That appointment slot is no longer available.");
    const { data, error } = await db
      .from("appointments")
      .insert({
        patient_id: patientId,
        doctor_id: input.doctor_id,
        appointment_date: input.appointment_date,
        time_slot: input.time_slot,
        reason,
        notes: "",
        status: "requested",
      })
      .select("id, appointment_date, time_slot, status")
      .single();
    return error
      ? fail(
          (error as any).code === "23505"
            ? "That slot was just booked by someone else."
            : "The appointment could not be booked.",
        )
      : { ok: true, appointment: data };
  }
  if (name === "cancel_appointment") {
    if (!uuid(input.appointment_id)) return fail("A valid appointment is required.");
    const { data: appointment } = await db
      .from("appointments")
      .select("id, status")
      .eq("id", input.appointment_id)
      .eq("patient_id", patientId)
      .maybeSingle();
    if (!appointment || !["requested", "confirmed"].includes(appointment.status))
      return fail("That appointment cannot be cancelled.");
    const { error } = await db
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointment.id)
      .eq("patient_id", patientId);
    return error
      ? fail("The appointment could not be cancelled.")
      : { ok: true, cancelled_appointment_id: appointment.id };
  }
  if (name === "reschedule_appointment") {
    if (
      !uuid(input.appointment_id) ||
      !validDate(input.appointment_date) ||
      !string(input.time_slot, 80)
    )
      return fail("A valid appointment, date, and time slot are required.");
    const { data: appointment } = await db
      .from("appointments")
      .select("id, doctor_id, status")
      .eq("id", input.appointment_id)
      .eq("patient_id", patientId)
      .maybeSingle();
    if (!appointment || !["requested", "confirmed"].includes(appointment.status))
      return fail("That appointment cannot be rescheduled.");
    const available = await slots(
      db,
      appointment.doctor_id,
      input.appointment_date,
      appointment.id,
    );
    if (!available.ok || !available.slots.includes(input.time_slot))
      return fail("That new slot is not available.");
    const { data, error } = await db
      .from("appointments")
      .update({
        appointment_date: input.appointment_date,
        time_slot: input.time_slot,
        status: "confirmed",
      })
      .eq("id", appointment.id)
      .eq("patient_id", patientId)
      .select("id, appointment_date, time_slot, status")
      .single();
    return error
      ? fail(
          (error as any).code === "23505"
            ? "That slot was just booked by someone else."
            : "The appointment could not be rescheduled.",
        )
      : { ok: true, appointment: data };
  }
  return fail("That action is not available.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  const aiRequestId = crypto.randomUUID();
  const logAiFailure = (event: string, details: Record<string, unknown> = {}) =>
    console.error(JSON.stringify({ event, aiRequestId, ...details }));
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply({ error: "Authentication is required." }, 401);
  const url = Deno.env.get("SUPABASE_URL"),
    anon = Deno.env.get("SUPABASE_ANON_KEY"),
    key = Deno.env.get("OPENROUTER_API_KEY");
  if (!url || !anon || !key) {
    logAiFailure("carebridge_ai_configuration_missing");
    return reply({ error: "AI service is not configured." }, 500);
  }
  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await db.auth
    .getUser(token)
    .catch(() => ({ data: { user: null }, error: true }));
  if (authError || !auth.user) return reply({ error: "Authentication is required." }, 401);
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError || !profile || !["patient", "doctor", "receptionist"].includes(profile.role))
    return reply({ error: "Your clinic profile is not available." }, 403);
  const role = profile.role as ClinicRole;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Request body must be valid JSON." }, 400);
  }
  if (!obj(body) || !string(body.message, 4000))
    return reply({ error: "A message of 4,000 characters or fewer is required." }, 400);
  const message = string(body.message, 4000)!;
  const rawHistory = body.messages === undefined ? [] : body.messages;
  if (!Array.isArray(rawHistory) || rawHistory.length > 16)
    return reply({ error: "Conversation history is invalid." }, 400);
  const history: History[] = [];
  for (const item of rawHistory) {
    if (
      !obj(item) ||
      (item.role !== "user" && item.role !== "assistant") ||
      !string(item.content, 4000)
    )
      return reply({ error: "Conversation history is invalid." }, 400);
    history.push({ role: item.role, content: string(item.content, 4000)! });
  }
  if (history.reduce((total, item) => total + item.content.length, 0) > 24000)
    return reply({ error: "Conversation history is too large." }, 400);
  const conversation: any[] = [
    {
      role: "system",
      content: systemFor(role),
    },
    ...(history.length ? history : [{ role: "user", content: message }]),
  ];
  if (!history.length || history.at(-1)?.role !== "user" || history.at(-1)?.content !== message)
    conversation.push({ role: "user", content: message });
  try {
    for (let turn = 0; turn < 4; turn++) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODEL_CONFIG.primaryModel,
          ...(AI_MODEL_CONFIG.fallbackModels.length
            ? { models: AI_MODEL_CONFIG.fallbackModels }
            : {}),
          messages: conversation,
          tools: toolsFor(role),
          tool_choice: "auto",
        }),
      });
      if (!response.ok) {
        const upstreamRequestId =
          response.headers.get("x-request-id") ??
          response.headers.get("x-openrouter-request-id") ??
          null;
        if (response.status === 429) {
          logAiFailure("openrouter_rate_limited", {
            upstreamStatus: response.status,
            upstreamRequestId,
          });
          return reply(
            { error: "The AI service is temporarily busy. Please try again shortly." },
            503,
          );
        }
        logAiFailure("openrouter_non_success", {
          upstreamStatus: response.status,
          upstreamRequestId,
        });
        return reply({ error: "The AI service could not complete the request." }, 502);
      }
      let completion: unknown;
      try {
        completion = await response.json();
      } catch {
        logAiFailure("openrouter_invalid_json_response");
        return reply({ error: "The AI service returned an invalid response." }, 502);
      }
      const assistant = (completion as { choices?: Array<{ message?: unknown }> })?.choices?.[0]
        ?.message;
      if (!assistant || typeof assistant !== "object") {
        logAiFailure("openrouter_invalid_completion");
        return reply({ error: "The AI service returned an invalid response." }, 502);
      }
      conversation.push(assistant);
      const calls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];
      if (!calls.length) {
        const answer = typeof assistant.content === "string" ? assistant.content.trim() : "";
        if (answer) return reply({ text: answer });
        logAiFailure("openrouter_empty_completion");
        return reply({ error: "The AI service returned an empty response." }, 502);
      }
      for (const call of calls) {
        let args: unknown = {};
        try {
          args = JSON.parse(call?.function?.arguments ?? "{}");
        } catch {
          /* safe invalid tool result below */
        }
        const result =
          typeof call?.function?.name === "string"
            ? await runTool(call.function.name, args, db, auth.user.id, role, message, history)
            : { ok: false, message: "Invalid tool request." };
        conversation.push({
          role: "tool",
          tool_call_id: call?.id ?? crypto.randomUUID(),
          content: JSON.stringify(result),
        });
      }
    }
    logAiFailure("openrouter_tool_turn_limit_reached");
    return reply({ error: "The AI service could not complete the request." }, 502);
  } catch (error) {
    logAiFailure("carebridge_ai_unexpected_failure", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return reply({ error: "The AI service is currently unavailable." }, 502);
  }
});
