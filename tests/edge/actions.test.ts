// @vitest-environment node
import { describe, expect, it } from "vitest";
import { executeAction, proposalTools } from "../../supabase/functions/carebridge-ai-v2/actions.ts";
import {
  ToolInputError,
  type Role,
  type ToolContext,
} from "../../supabase/functions/carebridge-ai-v2/shared.ts";
import { edgeClinic, ID } from "../helpers/edge";

const propose = (toolName: string, args: Record<string, unknown>, ctx: ToolContext) => {
  const tool = proposalTools.find((candidate) => candidate.name === toolName);
  if (!tool) throw new Error(`unknown tool ${toolName}`);
  return tool.run(args, ctx);
};

const TYPE_FOR: Record<string, string> = {
  propose_booking: "book_appointment",
  propose_cancel_my_appointment: "patient_cancel_appointment",
  propose_confirm_appointment: "confirm_appointment",
  propose_cancel_appointment: "cancel_appointment",
  propose_complete_consultation: "complete_consultation",
  propose_create_bill: "create_bill",
  propose_mark_bill_paid: "mark_bill_paid",
  propose_promote_to_doctor: "promote_patient_to_doctor",
  propose_accept_waitlist_offer: "accept_waitlist_offer",
  propose_resolve_followup: "resolve_followup",
};

const booking = {
  doctor_id: ID.marcus,
  appointment_date: "2026-10-05",
  time_slot: "10:00 am",
  reason: "Chest pain",
};

describe("proposal tools", () => {
  it("only create a pending action and never write clinic data", async () => {
    const clinic = edgeClinic();
    const ctx = clinic.ctx("patient");

    const result = await propose("propose_booking", booking, ctx);

    expect(result).toMatchObject({
      ok: true,
      status: "awaiting_user_confirmation",
      summary: "Book Dr. Marcus Vance on Mon 2026-10-05 at 10:00 AM",
    });
    expect(clinic.writes()).toEqual([]);
    const [created] = clinic.rpcCalls("ai_create_pending_action");
    expect(created?.args).toMatchObject({
      p_action_type: "book_appointment",
      p_payload: {
        doctor_id: ID.marcus,
        appointment_date: "2026-10-05",
        time_slot: "10:00 AM",
        reason: "Chest pain",
      },
    });
    expect(ctx.proposals).toHaveLength(1);
    expect(ctx.proposals[0]).toMatchObject({ status: "pending", action_type: "book_appointment" });
  });

  it("uses the slot string exactly as the doctor stores it", async () => {
    const clinic = edgeClinic();
    await propose("propose_booking", { ...booking, time_slot: "9:30 AM" }, clinic.ctx("patient"));
    expect(clinic.rpcCalls("ai_create_pending_action")[0]?.args["p_payload"]).toMatchObject({
      time_slot: "09:30AM",
    });
  });

  it.each([
    [{ appointment_date: "2026-09-30" }, "That date is in the past."],
    [
      { appointment_date: "2026-10-04" },
      "The doctor does not work on Sun. Working days: Mon, Tue, Wed, Thu, Fri.",
    ],
    [{ time_slot: "11:00 AM" }, "11:00 AM is not one of the doctor's slot times."],
    [{ doctor_id: ID.inactiveDoctor }, "That doctor is not available for booking."],
  ])("explain why a booking is not possible %#", async (change, message) => {
    const clinic = edgeClinic();
    await expect(
      propose("propose_booking", { ...booking, ...change }, clinic.ctx("patient")),
    ).resolves.toEqual({ ok: false, message });
    expect(clinic.rpcCalls("ai_create_pending_action")).toEqual([]);
  });

  it("refuse a slot that is already taken", async () => {
    const clinic = edgeClinic();
    clinic.setTaken(["10:00AM"]);
    await expect(propose("propose_booking", booking, clinic.ctx("patient"))).resolves.toEqual({
      ok: false,
      message: "That slot is already booked.",
    });
  });

  it("throw input errors for malformed arguments", async () => {
    const clinic = edgeClinic();
    await expect(
      propose("propose_booking", { ...booking, time_slot: "morning" }, clinic.ctx("patient")),
    ).rejects.toThrow(ToolInputError);
    await expect(
      propose("propose_booking", { ...booking, doctor_id: "marcus" }, clinic.ctx("patient")),
    ).rejects.toThrow("doctor_id must be a valid ID.");
  });

  it("hide other patients' appointments", async () => {
    const clinic = edgeClinic();
    await expect(
      propose(
        "propose_cancel_my_appointment",
        { appointment_id: ID.tomRequested },
        clinic.ctx("patient"),
      ),
    ).resolves.toEqual({ ok: false, message: "Appointment not found." });
  });

  it("refuse to change finished appointments", async () => {
    const clinic = edgeClinic();
    await expect(
      propose(
        "propose_cancel_my_appointment",
        { appointment_id: ID.cancelled },
        clinic.ctx("patient"),
      ),
    ).resolves.toEqual({
      ok: false,
      message: "This appointment is cancelled and cannot be changed.",
    });
  });
});

describe("executeAction", () => {
  const confirmRow = (toolName: string, role: Role, payload: Record<string, unknown>) => ({
    action_type: TYPE_FOR[toolName]!,
    role,
    payload,
  });

  it("books the appointment for the signed-in patient", async () => {
    const clinic = edgeClinic();

    const result = await executeAction(
      confirmRow("propose_booking", "patient", booking),
      clinic.ctx("patient"),
    );

    expect(result).toEqual({
      ok: true,
      message:
        "Your appointment request for Mon 2026-10-05 at 10:00 AM is booked. The front desk will confirm it.",
    });
    const [insert] = clinic.writes();
    expect(insert).toMatchObject({
      table: "appointments",
      op: "insert",
      payload: {
        patient_id: ID.sarah,
        doctor_id: ID.marcus,
        time_slot: "10:00 AM",
        status: "requested",
      },
    });
  });

  it("ignores a patient_id smuggled into the payload", async () => {
    const clinic = edgeClinic();
    await executeAction(
      confirmRow("propose_booking", "patient", { ...booking, patient_id: ID.tom }),
      clinic.ctx("patient"),
    );
    expect(clinic.writes()[0]?.payload).toMatchObject({ patient_id: ID.sarah });
  });

  it("re-checks the slot at confirm time", async () => {
    const clinic = edgeClinic();
    clinic.setTaken(["10:00 AM"]);
    await expect(
      executeAction(confirmRow("propose_booking", "patient", booking), clinic.ctx("patient")),
    ).resolves.toEqual({
      ok: false,
      message: "That slot is already booked.",
    });
    expect(clinic.writes()).toEqual([]);
  });

  it("explains a double booking race", async () => {
    const clinic = edgeClinic();
    clinic.fake.onQuery((query) =>
      query.op === "insert"
        ? { error: { code: "23505", message: "duplicate" } }
        : clinic.answer(query),
    );
    await expect(
      executeAction(confirmRow("propose_booking", "patient", booking), clinic.ctx("patient")),
    ).resolves.toEqual({
      ok: false,
      message: "That slot was just booked by someone else. Please choose another slot.",
    });
  });

  it.each<[Role, Role]>([
    ["patient", "receptionist"],
    ["receptionist", "receptionist"],
  ])("refuses a %s action for a %s", async (rowRole, userRole) => {
    const clinic = edgeClinic();
    const result = await executeAction(
      confirmRow("propose_booking", rowRole, booking),
      clinic.ctx(userRole),
    );
    expect(result).toEqual({ ok: false, message: "This action is not allowed for your account." });
    expect(clinic.writes()).toEqual([]);
  });

  it("refuses an unknown action type", async () => {
    const clinic = edgeClinic();
    const result = await executeAction(
      { action_type: "drop_tables", role: "patient", payload: {} },
      clinic.ctx("patient"),
    );
    expect(result.ok).toBe(false);
  });

  it("lets the receptionist confirm only requested appointments", async () => {
    const clinic = edgeClinic();
    const ok = await executeAction(
      confirmRow("propose_confirm_appointment", "receptionist", { appointment_id: ID.requested }),
      clinic.ctx("receptionist"),
    );
    expect(ok).toEqual({ ok: true, message: "The appointment is confirmed." });
    expect(
      clinic.tables["appointments"]!.find((row) => row["id"] === ID.requested)?.["status"],
    ).toBe("confirmed");

    const again = await executeAction(
      confirmRow("propose_confirm_appointment", "receptionist", { appointment_id: ID.requested }),
      clinic.ctx("receptionist"),
    );
    expect(again).toEqual({ ok: false, message: "This appointment is confirmed, not requested." });
  });

  it("cancels an active appointment", async () => {
    const clinic = edgeClinic();
    const result = await executeAction(
      confirmRow("propose_cancel_appointment", "receptionist", { appointment_id: ID.tomRequested }),
      clinic.ctx("receptionist"),
    );
    expect(result.ok).toBe(true);
    expect(
      clinic.tables["appointments"]!.find((row) => row["id"] === ID.tomRequested)?.["status"],
    ).toBe("cancelled");
  });
});

describe("doctor consultations", () => {
  const consult = (appointmentId: string) => ({
    appointment_id: appointmentId,
    diagnosis: " Angina ",
    medicines: [{ name: "Aspirin", dosage: "75mg" }, { name: "Nitro" }],
    notes: "Rest",
  });

  it("completes the doctor's confirmed appointment through the RPC", async () => {
    const clinic = edgeClinic();
    const result = await executeAction(
      { action_type: "complete_consultation", role: "doctor", payload: consult(ID.confirmed) },
      clinic.ctx("doctor"),
    );
    expect(result.ok).toBe(true);
    expect(clinic.rpcCalls("complete_consultation")[0]?.args).toEqual({
      p_appointment_id: ID.confirmed,
      p_diagnosis: "Angina",
      p_medicines: [
        { name: "Aspirin", dosage: "75mg", frequency: "", duration: "" },
        { name: "Nitro", dosage: "", frequency: "", duration: "" },
      ],
      p_notes: "Rest",
    });
  });

  it("refuses appointments of other doctors", async () => {
    const clinic = edgeClinic();
    await expect(
      propose(
        "propose_complete_consultation",
        consult(ID.confirmed),
        clinic.ctx("doctor", { doctorId: ID.inactiveDoctor }),
      ),
    ).resolves.toEqual({ ok: false, message: "Appointment not found among your appointments." });
  });

  it("refuses appointments that are not confirmed", async () => {
    const clinic = edgeClinic();
    await expect(
      propose("propose_complete_consultation", consult(ID.requested), clinic.ctx("doctor")),
    ).resolves.toEqual({
      ok: false,
      message: "Only confirmed appointments can be completed. This one is requested.",
    });
  });

  it("refuses a second prescription", async () => {
    const clinic = edgeClinic();
    clinic.tables["prescriptions"]!.push({ id: "rx", appointment_id: ID.confirmed });
    await expect(
      propose("propose_complete_consultation", consult(ID.confirmed), clinic.ctx("doctor")),
    ).resolves.toEqual({
      ok: false,
      message: "This appointment already has a prescription.",
    });
  });
});

describe("billing", () => {
  it("totals bill items and rounds to cents", async () => {
    const clinic = edgeClinic();
    const result = await executeAction(
      {
        action_type: "create_bill",
        role: "receptionist",
        payload: {
          appointment_id: ID.completed,
          items: [
            { label: "Consultation", amount: 80 },
            { label: "Dressing", amount: "0.1" },
            { label: "Gauze", amount: 0.2 },
          ],
        },
      },
      clinic.ctx("receptionist"),
    );
    expect(result).toEqual({
      ok: true,
      message: "The bill for 80.3 is created and marked unpaid.",
    });
    expect(clinic.writes()[0]).toMatchObject({
      table: "bills",
      payload: {
        appointment_id: ID.completed,
        patient_id: ID.sarah,
        amount: 80.3,
        status: "unpaid",
      },
    });
  });

  it("refuses bills for unfinished or already billed visits", async () => {
    const clinic = edgeClinic();
    const items = [{ label: "Consultation", amount: 80 }];
    await expect(
      propose(
        "propose_create_bill",
        { appointment_id: ID.requested, items },
        clinic.ctx("receptionist"),
      ),
    ).resolves.toEqual({
      ok: false,
      message: "Bills can only be created for completed appointments.",
    });
    await expect(
      propose(
        "propose_create_bill",
        { appointment_id: ID.completedBilled, items },
        clinic.ctx("receptionist"),
      ),
    ).resolves.toEqual({ ok: false, message: "This appointment already has a bill." });
  });

  it("rejects non-positive amounts", async () => {
    const clinic = edgeClinic();
    await expect(
      propose(
        "propose_create_bill",
        { appointment_id: ID.completed, items: [{ label: "Refund", amount: -5 }] },
        clinic.ctx("receptionist"),
      ),
    ).rejects.toThrow("amount must be a number greater than 0 and at most 1000000.");
  });

  it("records a cash payment once", async () => {
    const clinic = edgeClinic();
    await expect(
      propose("propose_mark_bill_paid", { bill_id: ID.unpaidBill }, clinic.ctx("receptionist")),
    ).resolves.toMatchObject({
      ok: true,
      summary: "Record a cash payment of 80 from Sarah Jenkins",
    });
    await expect(
      propose("propose_mark_bill_paid", { bill_id: ID.paidBill }, clinic.ctx("receptionist")),
    ).resolves.toEqual({
      ok: false,
      message: "This bill is already paid.",
    });
  });
});

describe("staff and automations", () => {
  const promotion = {
    patient_id: ID.tom,
    specialization: "Dermatology",
    consultation_fee: 60,
    available_days: ["Mon", "Wed"],
    slots: ["9:00 am", "09:00 AM", "10:30 AM"],
  };

  it("promotes a patient to doctor with normalized slots", async () => {
    const clinic = edgeClinic();
    const result = await executeAction(
      { action_type: "promote_patient_to_doctor", role: "receptionist", payload: promotion },
      clinic.ctx("receptionist"),
    );
    expect(result.ok).toBe(true);
    expect(clinic.rpcCalls("promote_patient_to_doctor")[0]?.args).toMatchObject({
      p_target_profile_id: ID.tom,
      p_available_days: ["Mon", "Wed"],
      p_slots: ["09:00 AM", "10:30 AM"],
      p_active: true,
    });
  });

  it("rejects long weekday names and non-patients", async () => {
    const clinic = edgeClinic();
    await expect(
      propose(
        "propose_promote_to_doctor",
        { ...promotion, available_days: ["Monday"] },
        clinic.ctx("receptionist"),
      ),
    ).rejects.toThrow("available_days must use Mon, Tue, Wed, Thu, Fri, Sat, Sun.");
    await expect(
      propose(
        "propose_promote_to_doctor",
        { ...promotion, patient_id: ID.clara },
        clinic.ctx("receptionist"),
      ),
    ).resolves.toEqual({ ok: false, message: "This user is already a receptionist." });
  });

  it("accepts only live waitlist offers", async () => {
    const clinic = edgeClinic();
    await expect(
      propose(
        "propose_accept_waitlist_offer",
        { offer_id: ID.pendingOffer },
        clinic.ctx("patient"),
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      propose(
        "propose_accept_waitlist_offer",
        { offer_id: ID.expiredOffer },
        clinic.ctx("patient"),
      ),
    ).resolves.toEqual({ ok: false, message: "This offer has expired." });
  });

  it("maps a taken offer slot to a friendly message", async () => {
    const clinic = edgeClinic();
    clinic.rpcResult("accept_waitlist_offer", { error: { code: "23505", message: "duplicate" } });
    await expect(
      executeAction(
        {
          action_type: "accept_waitlist_offer",
          role: "patient",
          payload: { offer_id: ID.pendingOffer },
        },
        clinic.ctx("patient"),
      ),
    ).resolves.toEqual({ ok: false, message: "Sorry, that slot was just taken." });
  });

  it("passes database permission errors through", async () => {
    const clinic = edgeClinic();
    clinic.rpcResult("resolve_followup", {
      error: { code: "42501", message: "Only receptionists can resolve follow-ups." },
    });
    await expect(
      executeAction(
        {
          action_type: "resolve_followup",
          role: "receptionist",
          payload: { followup_id: ID.openFollowup, note: "Called" },
        },
        clinic.ctx("receptionist"),
      ),
    ).resolves.toEqual({ ok: false, message: "Only receptionists can resolve follow-ups." });
  });
});
