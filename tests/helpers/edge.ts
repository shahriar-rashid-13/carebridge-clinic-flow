import type {
  Proposal,
  Role,
  ToolContext,
} from "../../supabase/functions/carebridge-ai-v2/shared.ts";
import { memoryDb, type Row } from "./memory-db";
import { createFakeSupabase, type Result } from "./supabase";

/** Thursday. The clinic data below is arranged around this date. */
export const TODAY = "2026-10-01";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ID = {
  sarah: uuid(1),
  tom: uuid(2),
  marcusUser: uuid(3),
  clara: uuid(4),
  marcus: uuid(10),
  inactiveDoctor: uuid(11),
  requested: uuid(20),
  confirmed: uuid(21),
  completed: uuid(22),
  completedBilled: uuid(23),
  tomRequested: uuid(24),
  cancelled: uuid(25),
  unpaidBill: uuid(30),
  paidBill: uuid(31),
  pendingOffer: uuid(40),
  expiredOffer: uuid(41),
  openFollowup: uuid(50),
  missing: uuid(99),
};

const appointment = (
  id: string,
  patient: string,
  date: string,
  slot: string,
  status: string,
): Row => ({
  id,
  patient_id: patient,
  doctor_id: ID.marcus,
  appointment_date: date,
  time_slot: slot,
  reason: "Checkup",
  notes: "",
  status,
});

const rows = (): Record<string, Row[]> => ({
  profiles: [
    { id: ID.sarah, full_name: "Sarah Jenkins", email: "sarah@example.com", role: "patient" },
    { id: ID.tom, full_name: "Tom Baker", email: "tom@example.com", role: "patient" },
    {
      id: ID.marcusUser,
      full_name: "Dr. Marcus Vance",
      email: "marcus@example.com",
      role: "doctor",
    },
    { id: ID.clara, full_name: "Clara Morgan", email: "clara@example.com", role: "receptionist" },
  ],
  doctors: [
    {
      id: ID.marcus,
      user_id: ID.marcusUser,
      specialization: "Cardiology",
      consultation_fee: 80,
      room: "201",
      available_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      slots: ["09:00 AM", "09:30AM", "10:00 AM"],
      status: "active",
      profile: { full_name: "Dr. Marcus Vance" },
    },
    {
      id: ID.inactiveDoctor,
      user_id: uuid(12),
      specialization: "Dermatology",
      consultation_fee: 60,
      room: "105",
      available_days: ["Mon"],
      slots: ["09:00 AM"],
      status: "inactive",
      profile: { full_name: "Dr. Away" },
    },
  ],
  appointments: [
    appointment(ID.requested, ID.sarah, "2026-10-05", "09:00 AM", "requested"),
    appointment(ID.confirmed, ID.sarah, "2026-10-06", "10:00 AM", "confirmed"),
    appointment(ID.completed, ID.sarah, "2026-09-20", "09:00 AM", "completed"),
    appointment(ID.completedBilled, ID.sarah, "2026-09-10", "09:00 AM", "completed"),
    appointment(ID.tomRequested, ID.tom, "2026-10-07", "09:30AM", "requested"),
    appointment(ID.cancelled, ID.sarah, "2026-10-08", "09:00 AM", "cancelled"),
  ],
  prescriptions: [],
  bills: [
    {
      id: ID.unpaidBill,
      appointment_id: ID.completedBilled,
      patient_id: ID.sarah,
      amount: 80,
      status: "unpaid",
    },
    {
      id: ID.paidBill,
      appointment_id: ID.completedBilled,
      patient_id: ID.tom,
      amount: 50,
      status: "paid",
    },
  ],
  waitlist_offers: [
    {
      id: ID.pendingOffer,
      doctor_id: ID.marcus,
      offer_date: "2026-10-05",
      time_slot: "10:00 AM",
      status: "pending",
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    },
    {
      id: ID.expiredOffer,
      doctor_id: ID.marcus,
      offer_date: "2026-10-05",
      time_slot: "10:00 AM",
      status: "pending",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    },
  ],
  appointment_followups: [{ id: ID.openFollowup, appointment_id: ID.tomRequested, status: "open" }],
});

const USER_FOR: Record<Role, string> = {
  patient: ID.sarah,
  doctor: ID.marcusUser,
  receptionist: ID.clara,
};

/** Fake Supabase client backed by the clinic rows above, plus a ToolContext factory. */
export function edgeClinic() {
  const fake = createFakeSupabase();
  const db = memoryDb(rows());
  const rpcResults: Record<string, Result> = {};
  let taken: string[] = [];
  let proposalCount = 0;

  fake.onQuery(db.handler);
  fake.onRpc((name, args) => {
    if (name === "ai_create_pending_action") {
      const proposal: Proposal = {
        id: uuid(900 + ++proposalCount),
        action_type: String(args["p_action_type"]),
        summary: String(args["p_summary"]),
        details: args["p_details"] as Proposal["details"],
        status: "pending",
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
      return { data: proposal };
    }
    if (name === "get_taken_slots") return { data: taken };
    return rpcResults[name] ?? { data: null };
  });

  const ctx = (role: Role, overrides: Partial<ToolContext> = {}): ToolContext => ({
    db: fake.client as unknown as ToolContext["db"],
    userId: USER_FOR[role],
    role,
    doctorId: role === "doctor" ? ID.marcus : null,
    today: TODAY,
    proposals: [],
    ...overrides,
  });

  return {
    fake,
    tables: db.tables,
    /** Default in-memory answer, for handlers that override only some queries. */
    answer: db.handler,
    ctx,
    setTaken(slots: string[]) {
      taken = slots;
    },
    rpcResult(name: string, result: Result) {
      rpcResults[name] = result;
    },
    rpcCalls(name: string) {
      return fake.rpcs.filter((call) => call.name === name);
    },
    writes() {
      return fake.queries.filter((query) => query.op !== "select");
    },
  };
}
