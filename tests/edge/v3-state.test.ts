// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeState,
  emptyState,
  loadState,
  mergeState,
  sanitizeState,
  saveState,
  STATE_TTL_HOURS,
} from "../../supabase/functions/carebridge-ai-v3/state.ts";

const DOCTOR = "11111111-1111-4111-8111-111111111111";
const PATIENT_A = "22222222-2222-4222-8222-222222222222";
const PATIENT_B = "33333333-3333-4333-8333-333333333333";
const CONVERSATION = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-10-07T12:00:00Z");

type Call = { method: string; args: unknown[] };

function fakeDb(result: { data?: unknown; error?: { message: string } | null; throws?: boolean }) {
  const calls: Call[] = [];
  const record = (method: string, ...args: unknown[]) => calls.push({ method, args });
  const respond = async () => {
    if (result.throws) throw new Error("network down");
    return { data: result.data ?? null, error: result.error ?? null };
  };
  const db = {
    from(table: string) {
      record("from", table);
      return {
        select(columns: string) {
          record("select", columns);
          return {
            eq(column: string, value: unknown) {
              record("eq", column, value);
              return {
                maybeSingle() {
                  record("maybeSingle");
                  return respond();
                },
              };
            },
          };
        },
        upsert(row: unknown, options: unknown) {
          record("upsert", row, options);
          return respond();
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitizeState", () => {
  it("keeps valid fields", () => {
    const state = {
      specialization: "Cardiology",
      doctor_id: DOCTOR,
      doctor_name: "Dr. Marcus Vance",
      date: "2026-10-09",
      patient_id: PATIENT_A,
      patient_name: "Sarah Jenkins",
      last_agent: "scheduling",
      pending_intents: ["billing"],
    };
    expect(sanitizeState(state)).toEqual(state);
  });

  it("drops unknown keys and badly typed values", () => {
    expect(
      sanitizeState({
        specialization: 42,
        doctor_id: "not-a-uuid",
        doctor_name: "   ",
        date: "2026-02-30",
        patient_id: "123",
        last_agent: "pharmacy",
        pending_intents: "billing",
        role: "receptionist",
      }),
    ).toEqual({});
  });

  it("caps strings, collapses whitespace, and dedupes pending intents", () => {
    const state = sanitizeState({
      doctor_name: `Dr.\n${"x".repeat(200)}`,
      pending_intents: ["billing", "billing", "pharmacy", "records", "triage", "scheduling"],
    });
    expect(state.doctor_name).toHaveLength(120);
    expect(state.doctor_name?.startsWith("Dr. x")).toBe(true);
    expect(state.pending_intents).toEqual(["billing", "records", "triage"]);
  });

  it("keeps at most five valid known appointments", () => {
    const valid = {
      appointment_id: DOCTOR,
      date: "2026-10-13",
      time_slot: "14:00",
      doctor_name: "Dr. A",
    };
    const state = sanitizeState({
      appointments: [
        { ...valid, appointment_id: "123" },
        { ...valid, date: "soon" },
        "x",
        ...Array.from({ length: 6 }, () => valid),
      ],
    });
    expect(state.appointments).toEqual(Array.from({ length: 5 }, () => valid));
  });

  it("returns an empty state for non-objects", () => {
    expect(sanitizeState(null)).toEqual({});
    expect(sanitizeState("state")).toEqual({});
    expect(sanitizeState([1])).toEqual({});
    expect(emptyState()).toEqual({});
  });
});

describe("mergeState", () => {
  it("shallow merges and removes keys patched with null", () => {
    expect(
      mergeState(
        { specialization: "Cardiology", date: "2026-10-09" },
        { doctor_name: "Dr. Vance", date: null },
      ),
    ).toEqual({ specialization: "Cardiology", doctor_name: "Dr. Vance" });
  });

  it("sanitizes the merged result", () => {
    expect(mergeState({}, { doctor_id: "bad", date: "2026-10-09" })).toEqual({
      date: "2026-10-09",
    });
  });

  it("clears doctor, date and appointments when the patient changes", () => {
    const previous = {
      specialization: "Cardiology",
      doctor_id: DOCTOR,
      doctor_name: "Dr. Vance",
      date: "2026-10-09",
      patient_id: PATIENT_A,
      patient_name: "Sarah",
      appointments: [
        { appointment_id: DOCTOR, date: "2026-10-13", time_slot: "14:00", doctor_name: "Dr. A" },
      ],
    };
    expect(mergeState(previous, { patient_id: PATIENT_B, patient_name: "Omar" })).toEqual({
      specialization: "Cardiology",
      patient_id: PATIENT_B,
      patient_name: "Omar",
    });
  });

  it("keeps doctor and date sent together with the new patient", () => {
    expect(
      mergeState(
        { doctor_name: "Dr. Vance", patient_id: PATIENT_A },
        { patient_id: PATIENT_B, doctor_name: "Dr. Rahman" },
      ),
    ).toEqual({ patient_id: PATIENT_B, doctor_name: "Dr. Rahman" });
  });

  it("keeps context when the same or first patient is set", () => {
    expect(
      mergeState({ doctor_name: "Dr. Vance", patient_id: PATIENT_A }, { patient_id: PATIENT_A }),
    ).toEqual({ doctor_name: "Dr. Vance", patient_id: PATIENT_A });
    expect(mergeState({ date: "2026-10-09" }, { patient_id: PATIENT_A })).toEqual({
      date: "2026-10-09",
      patient_id: PATIENT_A,
    });
  });
});

describe("loadState", () => {
  it("returns empty state without querying when there is no conversation", async () => {
    const { db, calls } = fakeDb({});
    expect(await loadState(db, null, NOW)).toEqual({});
    expect(calls).toEqual([]);
  });

  it("loads and sanitizes a fresh row", async () => {
    const { db, calls } = fakeDb({
      data: { state: { date: "2026-10-09", doctor_id: "bad" }, updated_at: hoursAgo(2) },
    });
    expect(await loadState(db, CONVERSATION, NOW)).toEqual({ date: "2026-10-09" });
    expect(calls).toEqual([
      { method: "from", args: ["ai_conversation_state"] },
      { method: "select", args: ["state, updated_at"] },
      { method: "eq", args: ["conversation_id", CONVERSATION] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("expires state older than the TTL", async () => {
    const stale = fakeDb({
      data: { state: { date: "2026-10-09" }, updated_at: hoursAgo(STATE_TTL_HOURS + 0.1) },
    });
    expect(await loadState(stale.db, CONVERSATION, NOW)).toEqual({});
    const edge = fakeDb({
      data: { state: { date: "2026-10-09" }, updated_at: hoursAgo(STATE_TTL_HOURS - 0.1) },
    });
    expect(await loadState(edge.db, CONVERSATION, NOW)).toEqual({ date: "2026-10-09" });
  });

  it("returns empty state for a missing row", async () => {
    const { db } = fakeDb({ data: null });
    expect(await loadState(db, CONVERSATION, NOW)).toEqual({});
  });

  it("warns and returns empty state on query errors or exceptions", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadState(fakeDb({ error: { message: "boom" } }).db, CONVERSATION, NOW)).toEqual(
      {},
    );
    expect(await loadState(fakeDb({ throws: true }).db, CONVERSATION, NOW)).toEqual({});
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain("boom");
  });
});

describe("saveState", () => {
  it("upserts the sanitized state without user_id", async () => {
    const { db, calls } = fakeDb({});
    const saved = await saveState(db, CONVERSATION, {
      date: "2026-10-09",
      doctor_id: "bad",
    } as never);
    expect(saved).toBe(true);
    const upsert = calls.find((call) => call.method === "upsert");
    expect(calls[0]).toEqual({ method: "from", args: ["ai_conversation_state"] });
    expect(upsert?.args).toEqual([
      { conversation_id: CONVERSATION, state: { date: "2026-10-09" } },
      { onConflict: "conversation_id" },
    ]);
    expect(upsert?.args[0]).not.toHaveProperty("user_id");
  });

  it("warns and returns false on errors without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await saveState(fakeDb({ error: { message: "rls" } }).db, CONVERSATION, {})).toBe(false);
    expect(await saveState(fakeDb({ throws: true }).db, CONVERSATION, {})).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("describeState", () => {
  it("summarises known context without ids", () => {
    const line = describeState({
      specialization: "Cardiology",
      doctor_id: DOCTOR,
      doctor_name: "Dr. X",
      date: "2026-10-09",
      patient_id: PATIENT_A,
    });
    expect(line).toBe("Known context: specialization Cardiology; doctor Dr. X; date 2026-10-09.");
    expect(line).not.toContain(DOCTOR);
  });

  it("includes patient name and pending intents", () => {
    expect(describeState({ patient_name: "Sarah", pending_intents: ["billing", "records"] })).toBe(
      "Known context: patient Sarah; pending billing, records.",
    );
  });

  it("returns an empty string for empty state", () => {
    expect(describeState({})).toBe("");
    expect(describeState({ last_agent: "triage" })).toBe("");
  });
});
