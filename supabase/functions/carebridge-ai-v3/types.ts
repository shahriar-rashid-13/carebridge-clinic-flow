import type { Role } from "../carebridge-ai-v2/shared.ts";

export type AgentName = "triage" | "scheduling" | "billing" | "records";
export const AGENTS: AgentName[] = ["triage", "scheduling", "billing", "records"];

/** Where the answer's facts should come from. */
export type KnowledgeRoute = "okf" | "rag" | "none";
export const KNOWLEDGE_ROUTES: KnowledgeRoute[] = ["okf", "rag", "none"];

/** The supervisor's routing decision after validation. */
export type RouteDecision = {
  agent: AgentName;
  /** Agents to run after `agent` in the same turn, in order. At most two handoffs are used. */
  handoffs: AgentName[];
  knowledge: KnowledgeRoute;
  /** OKF document id when knowledge is "okf", otherwise null. */
  okf_id: string | null;
  /** 0 to 1. Below CONFIDENCE_THRESHOLD the turn asks clarifying_question instead. */
  confidence: number;
  clarifying_question: string | null;
  /** "model" when the supervisor call produced valid JSON, "keywords" when the fallback router was used. */
  source: "model" | "keywords";
};

/** One OKF document parsed from knowledge/*.md. */
export type OkfDoc = {
  id: string;
  type: "policy" | "guidance" | "faq";
  title: string;
  description: string;
  owner: string;
  tags: string[];
  aliases: string[];
  timestamp: string;
  body: string;
};

export type KnownAppointment = {
  appointment_id: string;
  date: string;
  time_slot: string;
  doctor_name: string;
};

/**
 * Shared memory kept per conversation in public.ai_conversation_state.
 * Every field is optional; agents read all of it and write only what they learned.
 */
export type ConversationState = {
  /** Upcoming appointments a tool listed in this conversation, so a later turn can act on one. */
  appointments?: KnownAppointment[];
  specialization?: string;
  doctor_id?: string;
  doctor_name?: string;
  date?: string;
  /** Receptionist only: the patient currently being discussed. */
  patient_id?: string;
  patient_name?: string;
  last_agent?: AgentName;
  /** Intents the supervisor queued but this turn did not reach. */
  pending_intents?: AgentName[];
};

export type AgentContext = {
  role: Role;
  today: string;
  timeZone: string;
  state: ConversationState;
};
