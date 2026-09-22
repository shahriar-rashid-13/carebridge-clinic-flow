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
type BookingProposal = {
  doctorId: string;
  appointmentDate: string;
  timeSlot: string;
  reason: string;
};

const tools = [
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

const system =
  'You are CareBridge AI for a patient. Use tools for clinic data and never invent records, availability, prescriptions, or medical facts. Never disclose data beyond tool results. Format patient-facing answers as concise Markdown: use short paragraphs, bold labels where helpful, and put every numbered or bulleted list item on its own line. For booking, collect doctor, date, slot, and reason, check availability, restate the exact details, and ask for confirmation. When proposing a booking, append this exact marker on its own line: <carebridge-booking-proposal>{"doctor_id":"UUID","appointment_date":"YYYY-MM-DD","time_slot":"exact slot","reason":"exact reason"}</carebridge-booking-proposal>. Call book_appointment only when the latest user message is explicit confirmation and the immediately preceding assistant message contains an exact matching proposal. Never claim a write succeeded until its tool result says it did.';

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
  patientId: string,
  lastMessage: string,
  history: History[],
) {
  const fail = (message: string) => ({ ok: false, message });
  const input = obj(args) ? args : {};
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
  const patientToolsAllowed = profile.role === "patient";
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
      content: patientToolsAllowed
        ? system
        : "You are CareBridge AI. General conversation is allowed, but no clinic data or actions are available for this role.",
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
          ...(patientToolsAllowed ? { tools, tool_choice: "auto" } : {}),
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
            ? await runTool(call.function.name, args, db, auth.user.id, message, history)
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
