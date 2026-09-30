import { describe, expect, it } from "vitest";
import {
  appointmentStatusValue,
  mapAppointment,
  mapDoctor,
  mapInvoice,
  mapPrescription,
  mapProfileToPatient,
  normalizeDays,
  normalizeSlot,
  normalizeSlots,
} from "@/lib/clinic/adapters";

describe("normalizeDays", () => {
  it("accepts long and short names and returns them in week order", () => {
    expect(normalizeDays(["Friday", "mon", " Wednesday "])).toEqual(["Mon", "Wed", "Fri"]);
  });

  it("drops unknown days", () => {
    expect(normalizeDays(["Funday", "Tue"])).toEqual(["Tue"]);
  });
});

describe("normalizeSlot", () => {
  it.each([
    ["9:00am", "09:00 AM"],
    ["2:30pm", "02:30 PM"],
    ["09:00AM", "09:00 AM"],
    [" 11:15 pm ", "11:15 PM"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeSlot(input)).toBe(expected);
  });

  it("returns unrecognized input trimmed and unchanged", () => {
    expect(normalizeSlot(" 25:00 ")).toBe("25:00");
  });

  it("dedupes equivalent slots", () => {
    expect(normalizeSlots(["9:00am", "09:00 AM", "10:00 AM", ""])).toEqual([
      "09:00 AM",
      "10:00 AM",
    ]);
  });
});

describe("mapProfileToPatient", () => {
  it("maps profile columns and parses list fields", () => {
    const patient = mapProfileToPatient({
      id: "p1",
      full_name: "Sarah Jenkins",
      email: "sarah@example.com",
      allergies: '["Penicillin"]',
      conditions: "Asthma, Diabetes",
      emergency_name: "Tom",
      emergency_contact_phone: "555",
    });
    expect(patient).toMatchObject({
      id: "p1",
      name: "Sarah Jenkins",
      allergies: ["Penicillin"],
      conditions: ["Asthma", "Diabetes"],
      emergency: { name: "Tom", relation: "", phone: "555" },
    });
  });

  it("falls back to a placeholder name", () => {
    expect(mapProfileToPatient({ id: "p2" }).name).toBe("Unnamed patient");
  });
});

describe("mapDoctor", () => {
  it("prefers the profile name and normalizes schedule", () => {
    const doctor = mapDoctor(
      {
        id: "d1",
        name: "Old name",
        specialization: "Cardiology",
        consultation_fee: "80",
        available_days: ["Monday", "Wed"],
        slots: '["9:00am","09:00 AM","2:00pm"]',
        status: "Active",
      },
      { full_name: "Dr. Marcus Vance" },
    );
    expect(doctor).toMatchObject({
      name: "Dr. Marcus Vance",
      specialty: "Cardiology",
      fee: 80,
      days: ["Mon", "Wed"],
      slots: ["09:00 AM", "02:00 PM"],
      active: true,
    });
  });

  it("treats non-active status as inactive", () => {
    expect(mapDoctor({ id: "d2", status: "inactive" }).active).toBe(false);
  });
});

describe("mapAppointment", () => {
  it.each([
    ["confirmed", "Confirmed"],
    ["COMPLETED", "Completed"],
    ["canceled", "Cancelled"],
    ["cancelled", "Cancelled"],
    ["pending", "Requested"],
    [null, "Requested"],
  ])("maps status %s to %s", (status, expected) => {
    expect(mapAppointment({ id: "a1", status }).status).toBe(expected);
  });

  it("normalizes the time slot", () => {
    expect(mapAppointment({ id: "a1", time_slot: "2:30pm" }).slot).toBe("02:30 PM");
  });
});

describe("mapPrescription", () => {
  it("parses medicines stored as JSON text", () => {
    const prescription = mapPrescription({
      id: "rx1",
      medicines: JSON.stringify([
        { name: "Ibuprofen", dosage: "200mg", frequency: "2x", duration: "5d" },
      ]),
    });
    expect(prescription.medications).toEqual([
      { name: "Ibuprofen", dosage: "200mg", frequency: "2x", duration: "5d" },
    ]);
  });

  it("returns no medications for invalid JSON", () => {
    expect(mapPrescription({ id: "rx1", medicines: "{oops" }).medications).toEqual([]);
  });
});

describe("mapInvoice", () => {
  it("uses the invoice number as id and keeps the database id", () => {
    const invoice = mapInvoice({
      id: "uuid-1",
      invoice_number: "INV-001",
      amount: "120",
      items: [{ label: "Consultation", amount: "120" }],
      status: "PAID",
      payment_method: "Card",
      paid_at: "2026-09-01",
    });
    expect(invoice).toMatchObject({
      id: "INV-001",
      databaseId: "uuid-1",
      total: 120,
      items: [{ label: "Consultation", amount: 120 }],
      status: "Paid",
      method: "Card",
      paidAt: "2026-09-01",
    });
  });

  it("omits optional fields when absent", () => {
    const invoice = mapInvoice({ invoice_number: "INV-2", status: "unpaid" });
    expect(invoice.status).toBe("Unpaid");
    expect(invoice).not.toHaveProperty("databaseId");
    expect(invoice).not.toHaveProperty("method");
  });
});

it("appointmentStatusValue lowercases the status", () => {
  expect(appointmentStatusValue("Confirmed")).toBe("confirmed");
});
