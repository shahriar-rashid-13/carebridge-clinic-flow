// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getAvailableSlots,
  getDoctors,
} from "../../supabase/functions/carebridge-ai-v2/tools-common.ts";
import {
  getMyAppointments,
  getMyBills,
} from "../../supabase/functions/carebridge-ai-v2/tools-patient.ts";
import { searchPatients } from "../../supabase/functions/carebridge-ai-v2/tools-receptionist.ts";
import { edgeClinic, ID } from "../helpers/edge";

describe("get_doctors", () => {
  it("lists only active doctors for patients, even if they ask for inactive ones", async () => {
    const clinic = edgeClinic();
    const result = await getDoctors.run({ include_inactive: true }, clinic.ctx("patient"));
    const doctors = result["doctors"] as Record<string, unknown>[];
    expect(doctors.map((doctor) => doctor["name"])).toEqual(["Dr. Marcus Vance"]);
    expect(doctors[0]).not.toHaveProperty("status");
  });

  it("lets receptionists include inactive doctors", async () => {
    const clinic = edgeClinic();
    const result = await getDoctors.run({ include_inactive: true }, clinic.ctx("receptionist"));
    const doctors = result["doctors"] as Record<string, unknown>[];
    expect(doctors.map((doctor) => doctor["status"])).toEqual(["active", "inactive"]);
  });
});

describe("get_available_slots", () => {
  it("removes taken slots", async () => {
    const clinic = edgeClinic();
    clinic.setTaken(["09:00 AM"]);
    const result = await getAvailableSlots.run(
      { doctor_id: ID.marcus, appointment_date: "2026-10-05" },
      clinic.ctx("patient"),
    );
    expect(result).toEqual({
      ok: true,
      date: "2026-10-05",
      weekday: "Mon",
      available_slots: ["09:30AM", "10:00 AM"],
    });
    expect(clinic.rpcCalls("get_taken_slots")[0]?.args).toEqual({
      p_doctor_id: ID.marcus,
      p_date: "2026-10-05",
    });
  });

  it("explains non-working days", async () => {
    const clinic = edgeClinic();
    const result = await getAvailableSlots.run(
      { doctor_id: ID.marcus, appointment_date: "2026-10-03" },
      clinic.ctx("patient"),
    );
    expect(result).toMatchObject({
      ok: true,
      weekday: "Sat",
      available_slots: [],
      note: "The doctor does not work on Sat.",
    });
  });

  it("refuses past dates and inactive doctors", async () => {
    const clinic = edgeClinic();
    await expect(
      getAvailableSlots.run(
        { doctor_id: ID.marcus, appointment_date: "2026-09-01" },
        clinic.ctx("patient"),
      ),
    ).resolves.toEqual({ ok: false, message: "That date is in the past." });
    await expect(
      getAvailableSlots.run(
        { doctor_id: ID.inactiveDoctor, appointment_date: "2026-10-05" },
        clinic.ctx("patient"),
      ),
    ).resolves.toEqual({ ok: false, message: "That doctor is not available for booking." });
  });
});

describe("patient read tools", () => {
  it("get_my_appointments filters by the signed-in patient", async () => {
    const clinic = edgeClinic();
    const result = await getMyAppointments.run(
      { upcoming_only: true, status: "requested" },
      clinic.ctx("patient"),
    );
    const appointments = result["appointments"] as Record<string, unknown>[];
    expect(appointments.map((row) => row["appointment_id"])).toEqual([ID.requested]);
    const query = clinic.fake.queries.find((item) => item.table === "appointments")!;
    expect(query.filters).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["patient_id", ID.sarah] },
        { method: "gte", args: ["appointment_date", "2026-10-01"] },
      ]),
    );
  });

  it("get_my_bills returns only the patient's bills", async () => {
    const clinic = edgeClinic();
    const result = await getMyBills.run({}, clinic.ctx("patient"));
    expect((result["bills"] as Record<string, unknown>[]).map((bill) => bill["bill_id"])).toEqual([
      ID.unpaidBill,
    ]);
  });

  it("rejects unknown status filters", async () => {
    const clinic = edgeClinic();
    await expect(getMyBills.run({ status: "refunded" }, clinic.ctx("patient"))).rejects.toThrow(
      "status must be one of: unpaid, paid.",
    );
  });
});

describe("search_patients", () => {
  it("strips PostgREST filter characters from the search term", async () => {
    const clinic = edgeClinic();
    await searchPatients.run({ query: "sa,rah)*" }, clinic.ctx("receptionist"));
    const query = clinic.fake.queries.find((item) => item.table === "profiles")!;
    const filter = query.filters.find((item) => item.method === "or")!;
    expect(filter.args[0]).toBe(
      "full_name.ilike.%sa rah%,email.ilike.%sa rah%,phone.ilike.%sa rah%",
    );
    expect(query.filters).toContainEqual({ method: "eq", args: ["role", "patient"] });
  });

  it("requires at least two real characters", async () => {
    const clinic = edgeClinic();
    await expect(searchPatients.run({ query: "*(" }, clinic.ctx("receptionist"))).rejects.toThrow(
      "query must be at least 2 characters.",
    );
  });
});
