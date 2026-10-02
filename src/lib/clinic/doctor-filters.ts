import type { Doctor } from "./types";

// The clinic week runs Saturday to Friday.
export const WEEK_ORDER = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export type DoctorSort = "name" | "fee-asc" | "fee-desc" | "days";
export type DoctorGroup = "none" | "specialty" | "availability";

export interface DoctorQuery {
  search: string;
  specialty: string; // "all" or a specialty name
  day: string; // "any" or a weekday such as "Mon"
  sort: DoctorSort;
  group: DoctorGroup;
}

export interface DoctorSection {
  key: string;
  label: string | null;
  doctors: Doctor[];
}

export const DEFAULT_DOCTOR_QUERY: DoctorQuery = {
  search: "",
  specialty: "all",
  day: "any",
  sort: "name",
  group: "none",
};

const dayIndex = (day: string) => {
  const index = WEEK_ORDER.indexOf(day as (typeof WEEK_ORDER)[number]);
  return index === -1 ? WEEK_ORDER.length : index;
};

export function sortDays(days: string[]): string[] {
  return [...days].sort((a, b) => dayIndex(a) - dayIndex(b));
}

// Doctor names start with "Dr. ", which would make every name sort under D.
const sortName = (name: string) => name.replace(/^dr\.?\s+/i, "").toLowerCase();

export function specialtiesOf(doctors: Doctor[]): string[] {
  return [...new Set(doctors.map((d) => d.specialty))].sort((a, b) => a.localeCompare(b));
}

export function workingDaysOf(doctors: Doctor[]): string[] {
  return sortDays([...new Set(doctors.flatMap((d) => d.days))]);
}

function compare(sort: DoctorSort) {
  return (a: Doctor, b: Doctor) => {
    if (sort === "fee-asc" && a.fee !== b.fee) return a.fee - b.fee;
    if (sort === "fee-desc" && a.fee !== b.fee) return b.fee - a.fee;
    if (sort === "days" && a.days.length !== b.days.length) return b.days.length - a.days.length;
    return sortName(a.name).localeCompare(sortName(b.name));
  };
}

export function filterDoctors(doctors: Doctor[], query: DoctorQuery): Doctor[] {
  const terms = query.search.toLowerCase().split(/\s+/).filter(Boolean);
  return doctors
    .filter((d) => query.specialty === "all" || d.specialty === query.specialty)
    .filter((d) => query.day === "any" || d.days.includes(query.day))
    .filter((d) => {
      if (terms.length === 0) return true;
      const haystack = `${d.name} ${d.specialty} ${d.bio} ${d.room}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort(compare(query.sort));
}

export function groupDoctors(doctors: Doctor[], group: DoctorGroup): DoctorSection[] {
  if (group === "none") return [{ key: "all", label: null, doctors }];

  const sections = new Map<string, DoctorSection>();
  for (const doctor of doctors) {
    const key = group === "specialty" ? doctor.specialty : sortDays(doctor.days).join(", ");
    const label =
      group === "specialty"
        ? doctor.specialty
        : `${key} · ${doctor.days.length} ${doctor.days.length === 1 ? "day" : "days"} a week`;
    const section = sections.get(key) ?? { key, label, doctors: [] };
    section.doctors.push(doctor);
    sections.set(key, section);
  }

  const list = [...sections.values()];
  if (group === "specialty") return list.sort((a, b) => a.key.localeCompare(b.key));
  // Most available first, then by the first working day of the week.
  const days = (section: DoctorSection) => section.key.split(", ");
  return list.sort(
    (a, b) =>
      days(b).length - days(a).length ||
      dayIndex(days(a)[0] ?? "") - dayIndex(days(b)[0] ?? "") ||
      a.key.localeCompare(b.key),
  );
}
