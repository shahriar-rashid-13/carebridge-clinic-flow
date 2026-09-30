// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addDays,
  dateArg,
  dateRange,
  daysBetween,
  describeAppointments,
  enumArg,
  isIsoDate,
  isUuid,
  parseJsonField,
  textArg,
  ToolInputError,
  uuidArg,
  weekdayOf,
  type AppointmentRow,
} from "../../supabase/functions/carebridge-ai-v2/shared.ts";
import { edgeClinic, ID } from "../helpers/edge";

describe("validators", () => {
  it("isUuid accepts only UUID strings", () => {
    expect(isUuid(ID.sarah)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it("isIsoDate rejects impossible dates", () => {
    expect(isIsoDate("2026-10-01")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-1-5")).toBe(false);
    expect(isIsoDate("tomorrow")).toBe(false);
  });

  it("uuidArg requires a valid id unless optional", () => {
    expect(uuidArg({ id: ID.sarah }, "id")).toBe(ID.sarah);
    expect(uuidArg({}, "id", true)).toBeNull();
    expect(() => uuidArg({}, "id")).toThrow(new ToolInputError("id is required."));
    expect(() => uuidArg({ id: "abc" }, "id")).toThrow("id must be a valid ID.");
  });

  it("dateArg requires a real date", () => {
    expect(dateArg({ d: "2026-10-05" }, "d")).toBe("2026-10-05");
    expect(dateArg({ d: "" }, "d", true)).toBeNull();
    expect(() => dateArg({ d: "2026-13-01" }, "d")).toThrow(
      "d must be a real date in YYYY-MM-DD format.",
    );
  });

  it("enumArg allows only listed values", () => {
    expect(enumArg({ s: "paid" }, "s", ["paid", "unpaid"])).toBe("paid");
    expect(enumArg({}, "s", ["paid"])).toBeNull();
    expect(() => enumArg({ s: "void" }, "s", ["paid", "unpaid"])).toThrow(
      "s must be one of: paid, unpaid.",
    );
  });

  it("textArg trims and enforces length", () => {
    expect(textArg({ t: "  hi  " }, "t", 10)).toBe("hi");
    expect(textArg({}, "t", 10, true)).toBe("");
    expect(() => textArg({ t: "   " }, "t", 10)).toThrow("t is required.");
    expect(() => textArg({ t: "x".repeat(11) }, "t", 10)).toThrow(
      "t must be at most 10 characters.",
    );
  });
});

describe("dates", () => {
  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("daysBetween counts whole days", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
  });

  it("weekdayOf returns short names", () => {
    expect(weekdayOf("2026-09-29")).toBe("Tue");
    expect(weekdayOf("2026-10-04")).toBe("Sun");
  });

  it("dateRange defaults from today", () => {
    expect(dateRange({}, "2026-10-01", 7)).toEqual({ from: "2026-10-01", to: "2026-10-08" });
  });

  it("dateRange rejects reversed and long ranges", () => {
    expect(() =>
      dateRange({ date_from: "2026-10-05", date_to: "2026-10-01" }, "2026-10-01", 7),
    ).toThrow("date_to must be on or after date_from.");
    expect(() =>
      dateRange({ date_from: "2026-10-01", date_to: "2026-11-15" }, "2026-10-01", 7),
    ).toThrow("Date range must be at most 31 days.");
  });
});

it("parseJsonField parses JSON text and keeps other values", () => {
  expect(parseJsonField('[{"a":1}]')).toEqual([{ a: 1 }]);
  expect(parseJsonField("plain")).toBe("plain");
  expect(parseJsonField(undefined)).toBeNull();
  expect(parseJsonField([1])).toEqual([1]);
});

describe("describeAppointments", () => {
  const row: AppointmentRow = {
    id: ID.requested,
    patient_id: ID.sarah,
    doctor_id: ID.marcus,
    appointment_date: "2026-10-05",
    time_slot: "09:00 AM",
    reason: "Checkup",
    notes: "",
    status: "requested",
  };

  it("adds doctor names and hides patient data by default", async () => {
    const { ctx } = edgeClinic();
    const [described] = await describeAppointments(ctx("patient").db, [row], {
      includePatient: false,
    });
    expect(described).toEqual({
      appointment_id: ID.requested,
      date: "2026-10-05",
      time_slot: "09:00 AM",
      status: "requested",
      reason: "Checkup",
      notes: null,
      doctor_id: ID.marcus,
      doctor_name: "Dr. Marcus Vance",
      specialization: "Cardiology",
      room: "201",
    });
  });

  it("adds patient names when asked", async () => {
    const { ctx } = edgeClinic();
    const [described] = await describeAppointments(ctx("receptionist").db, [row], {
      includePatient: true,
    });
    expect(described).toMatchObject({ patient_id: ID.sarah, patient_name: "Sarah Jenkins" });
  });
});
