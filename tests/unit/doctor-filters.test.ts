import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCTOR_QUERY,
  filterDoctors,
  groupDoctors,
  sortDays,
  specialtiesOf,
  workingDaysOf,
  type DoctorQuery,
} from "@/lib/clinic/doctor-filters";
import type { Doctor } from "@/lib/clinic/types";

const doctor = (overrides: Partial<Doctor>): Doctor => ({
  id: overrides.name ?? "id",
  name: "Dr. Test",
  specialty: "General Medicine",
  fee: 600,
  days: ["Sat", "Mon", "Wed"],
  slots: ["09:00 AM"],
  active: true,
  bio: "",
  room: "Room 101",
  ...overrides,
});

const doctors = [
  doctor({
    name: "Dr. Tanvir Ahmed",
    specialty: "General Medicine",
    fee: 600,
    days: ["Sun", "Tue", "Thu"],
  }),
  doctor({
    name: "Dr. Rafiqul Islam",
    specialty: "Cardiology",
    fee: 1400,
    days: ["Sat", "Sun", "Mon", "Tue", "Wed"],
    bio: "Senior consultant",
  }),
  doctor({
    name: "Dr. Farhana Kabir",
    specialty: "General Medicine",
    fee: 600,
    days: ["Sat", "Mon", "Wed"],
    room: "Room 101",
  }),
  doctor({
    name: "Dr. Sabrina Chowdhury",
    specialty: "Cardiology",
    fee: 1200,
    days: ["Sun", "Tue", "Thu"],
    room: "Room 202",
  }),
];

const query = (patch: Partial<DoctorQuery>): DoctorQuery => ({ ...DEFAULT_DOCTOR_QUERY, ...patch });
const names = (list: Doctor[]) => list.map((d) => d.name);

describe("doctor filters", () => {
  it("sorts by name ignoring the Dr. prefix", () => {
    expect(names(filterDoctors(doctors, query({})))).toEqual([
      "Dr. Farhana Kabir",
      "Dr. Rafiqul Islam",
      "Dr. Sabrina Chowdhury",
      "Dr. Tanvir Ahmed",
    ]);
  });

  it("searches every term across name, specialty, bio and room", () => {
    expect(names(filterDoctors(doctors, query({ search: "cardio senior" })))).toEqual([
      "Dr. Rafiqul Islam",
    ]);
    expect(names(filterDoctors(doctors, query({ search: "room 202" })))).toEqual([
      "Dr. Sabrina Chowdhury",
    ]);
    expect(filterDoctors(doctors, query({ search: "nobody" }))).toEqual([]);
  });

  it("filters by specialty and working day", () => {
    expect(names(filterDoctors(doctors, query({ specialty: "Cardiology", day: "Thu" })))).toEqual([
      "Dr. Sabrina Chowdhury",
    ]);
  });

  it("sorts by fee and by number of working days", () => {
    expect(names(filterDoctors(doctors, query({ sort: "fee-desc" })))[0]).toBe("Dr. Rafiqul Islam");
    expect(names(filterDoctors(doctors, query({ sort: "fee-asc" })))).toEqual([
      "Dr. Farhana Kabir",
      "Dr. Tanvir Ahmed",
      "Dr. Sabrina Chowdhury",
      "Dr. Rafiqul Islam",
    ]);
    expect(names(filterDoctors(doctors, query({ sort: "days" })))[0]).toBe("Dr. Rafiqul Islam");
  });

  it("groups by specialty in alphabetical order", () => {
    const sections = groupDoctors(filterDoctors(doctors, query({})), "specialty");
    expect(sections.map((s) => s.label)).toEqual(["Cardiology", "General Medicine"]);
    expect(names(sections[1].doctors)).toEqual(["Dr. Farhana Kabir", "Dr. Tanvir Ahmed"]);
  });

  it("groups by working days with the most available first", () => {
    const sections = groupDoctors(filterDoctors(doctors, query({})), "availability");
    expect(sections.map((s) => s.key)).toEqual([
      "Sat, Sun, Mon, Tue, Wed",
      "Sat, Mon, Wed",
      "Sun, Tue, Thu",
    ]);
    expect(sections[0].label).toBe("Sat, Sun, Mon, Tue, Wed · 5 days a week");
    expect(sections[2].doctors).toHaveLength(2);
  });

  it("returns one unlabeled section without grouping", () => {
    expect(groupDoctors(doctors, "none")).toEqual([{ key: "all", label: null, doctors }]);
  });

  it("lists specialties and working days in clinic week order", () => {
    expect(specialtiesOf(doctors)).toEqual(["Cardiology", "General Medicine"]);
    expect(workingDaysOf(doctors)).toEqual(["Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]);
    expect(sortDays(["Fri", "Mon", "Sat"])).toEqual(["Sat", "Mon", "Fri"]);
  });
});
