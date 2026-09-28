import { boolArg, dateArg, uuidArg, weekdayOf, type ToolDefinition } from "./shared.ts";

export const getDoctors: ToolDefinition = {
  name: "get_doctors",
  description:
    "List CareBridge doctors with specialization, consultation fee, room, working days, and slot times. Receptionists may include inactive doctors.",
  parameters: {
    type: "object",
    properties: {
      include_inactive: {
        type: "boolean",
        description: "Receptionist only. Include inactive doctors.",
      },
    },
  },
  roles: ["patient", "doctor", "receptionist"],
  async run(args, ctx) {
    let query = ctx.db
      .from("doctors")
      .select(
        "id, specialization, consultation_fee, room, available_days, slots, status, profile:profiles!doctors_user_id_fkey(full_name)",
      );
    if (!(ctx.role === "receptionist" && boolArg(args, "include_inactive"))) {
      query = query.eq("status", "active");
    }
    const { data, error } = await query;
    if (error) throw new Error(`get_doctors failed: ${error.message}`);
    return {
      ok: true,
      doctors: (data ?? []).map((row: any) => ({
        doctor_id: row.id,
        name: row.profile?.full_name ?? "CareBridge doctor",
        specialization: row.specialization,
        consultation_fee: row.consultation_fee,
        room: row.room,
        working_days: row.available_days ?? [],
        slot_times: row.slots ?? [],
        ...(ctx.role === "receptionist" ? { status: row.status } : {}),
      })),
    };
  },
};

export const getAvailableSlots: ToolDefinition = {
  name: "get_available_slots",
  description:
    "Get the free appointment slots for one doctor on one date. Use get_doctors first to find the doctor_id.",
  parameters: {
    type: "object",
    properties: {
      doctor_id: { type: "string", description: "Doctor ID from get_doctors." },
      appointment_date: { type: "string", description: "Date in YYYY-MM-DD format." },
    },
    required: ["doctor_id", "appointment_date"],
  },
  roles: ["patient", "doctor", "receptionist"],
  async run(args, ctx) {
    const doctorId = uuidArg(args, "doctor_id");
    const date = dateArg(args, "appointment_date");
    if (date < ctx.today) return { ok: false, message: "That date is in the past." };

    const { data: doctor, error } = await ctx.db
      .from("doctors")
      .select("id, available_days, slots, status")
      .eq("id", doctorId)
      .maybeSingle();
    if (error) throw new Error(`get_available_slots doctor failed: ${error.message}`);
    if (!doctor || doctor.status !== "active") {
      return { ok: false, message: "That doctor is not available for booking." };
    }

    const weekday = weekdayOf(date);
    const workingDays: string[] = Array.isArray(doctor.available_days) ? doctor.available_days : [];
    if (!workingDays.includes(weekday)) {
      return { ok: true, date, weekday, available_slots: [], note: `The doctor does not work on ${weekday}.`, working_days: workingDays };
    }

    const { data: taken, error: takenError } = await ctx.db.rpc("get_taken_slots", {
      p_doctor_id: doctorId,
      p_date: date,
    });
    if (takenError) throw new Error(`get_taken_slots failed: ${takenError.message}`);
    const occupied = new Set((taken ?? []) as string[]);
    const slots: string[] = Array.isArray(doctor.slots) ? doctor.slots : [];
    return {
      ok: true,
      date,
      weekday,
      available_slots: slots.filter((slot) => typeof slot === "string" && !occupied.has(slot)),
    };
  },
};
