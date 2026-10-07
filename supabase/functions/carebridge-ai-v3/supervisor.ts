import { callGateway, MODEL_ALIAS, type GatewayMessage } from "../carebridge-ai-v2/gateway.ts";
import type { Role } from "../carebridge-ai-v2/shared.ts";
import { parseRouteDecision } from "./guardrails.ts";
import { findOkf, okfCatalog } from "./okf.ts";
import { describeState } from "./state.ts";
import type { AgentName, ConversationState, OkfDoc, RouteDecision } from "./types.ts";

export const SUPERVISOR_TIMEOUT_MS = 12_000;
const MAX_CONTEXT_MESSAGES = 4;
const MAX_CONTEXT_CHARS = 600;

const AGENT_SUMMARY: Record<AgentName, string> = {
  triage: "symptoms, which specialist to see, general health questions, general clinic questions",
  scheduling: "appointments, free slots, booking, cancelling, rescheduling, waitlist, follow-ups",
  billing: "bills, fees, payments, refunds",
  records: "profile, prescriptions, visit history, consultations, staff roles",
};

const KEYWORDS: Record<AgentName, RegExp> = {
  scheduling:
    /\b(book|booking|appointments?|slots?|reschedul\w*|cancel\w*|waitlist|wait list|available|availability|schedule|follow-?ups?|confirm)\b/i,
  billing:
    /\b(bills?|billing|invoices?|pay|paid|payments?|fees?|cost|price|refunds?|charges?|taka|bkash|cash)\b/i,
  records:
    /\b(prescriptions?|medicines?|medications?|history|profile|records?|diagnos\w*|consultations?|promote|role)\b/i,
  triage:
    /\b(symptoms?|pain|ache|fever|cough|headache|rash|dizzy|nausea|which doctor|specialist|sick|hurts?|feel(ing)?)\b/i,
};

const POLICY_WORDS =
  /\b(policy|policies|rules?|allowed|can i|how do i|how long|when (is|are|do)|what happens|hours|open)\b/i;

export function supervisorPrompt(
  role: Role,
  allowed: AgentName[],
  docs: OkfDoc[],
  state: ConversationState,
): string {
  return [
    `You route messages for CareBridge AI, a clinic assistant. The signed-in user is a ${role}. You do not answer the user.`,
    "Pick the specialist agent for the latest user message. Allowed agents:",
    ...allowed.map((agent) => `- ${agent}: ${AGENT_SUMMARY[agent]}`),
    "If the message has more than one request, put the other agents in handoffs, in the order the user asked (at most 2).",
    'Choose knowledge: "okf" when an approved clinic policy below answers the question (set okf_id), "rag" for other clinic or health questions that need the knowledge base, "none" for actions and the user\'s own data.',
    "Approved clinic policies:",
    okfCatalog(docs),
    "Set confidence from 0 to 1. If the request is unclear, set confidence below 0.6 and write one short clarifying_question.",
    describeState(state),
    'Reply with only one JSON object: {"agent": "...", "handoffs": [], "knowledge": "none", "okf_id": null, "confidence": 0.9, "clarifying_question": null}',
  ]
    .filter(Boolean)
    .join("\n");
}

/** Deterministic router used when the supervisor call fails or returns invalid JSON twice. */
export function keywordRoute(message: string, allowed: AgentName[], docs: OkfDoc[]): RouteDecision {
  const matches = allowed
    .map((agent) => ({ agent, index: message.search(KEYWORDS[agent]) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((match) => match.agent);
  const policy = findOkf(docs, message);
  const [agent = allowed.includes("triage") ? "triage" : allowed[0]!, ...handoffs] = matches;
  return {
    agent,
    handoffs: handoffs.slice(0, 2),
    knowledge: policy ? "okf" : POLICY_WORDS.test(message) ? "rag" : "none",
    okf_id: policy?.id ?? null,
    confidence: matches.length ? 0.7 : 0.6,
    clarifying_question: null,
    source: "keywords",
  };
}

export type SupervisorResult = {
  decision: RouteDecision;
  calls: number;
  model: string | null;
  usage: unknown[];
  error?: string;
};

export async function routeMessage(options: {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  role: Role;
  allowed: AgentName[];
  docs: OkfDoc[];
  state: ConversationState;
  timeoutMs?: number;
}): Promise<SupervisorResult> {
  const { message, allowed, docs } = options;
  const context = options.history.slice(-MAX_CONTEXT_MESSAGES).map((row) => ({
    role: row.role,
    content: row.content.slice(0, MAX_CONTEXT_CHARS),
  }));
  const messages: GatewayMessage[] = [
    { role: "system", content: supervisorPrompt(options.role, allowed, docs, options.state) },
    ...context,
    { role: "user", content: message },
  ];
  const okfIds = docs.map((doc) => doc.id);
  const usage: unknown[] = [];
  let model: string | null = null;
  let error = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callGateway({
      model: MODEL_ALIAS,
      messages,
      timeoutMs: options.timeoutMs ?? SUPERVISOR_TIMEOUT_MS,
    });
    if (!result.ok) {
      error = result.detail;
      return {
        decision: keywordRoute(message, allowed, docs),
        calls: attempt + 1,
        model,
        usage,
        error,
      };
    }
    usage.push(result.usage);
    model = result.model;
    const decision = parseRouteDecision(result.content ?? "", { allowedAgents: allowed, okfIds });
    if (decision) return { decision, calls: attempt + 1, model, usage };
    error = "invalid supervisor JSON";
    messages.push(
      { role: "assistant", content: result.content ?? "" },
      {
        role: "user",
        content: `That was not valid. Reply with only the JSON object. agent must be one of: ${allowed.join(", ")}.`,
      },
    );
  }
  return { decision: keywordRoute(message, allowed, docs), calls: 2, model, usage, error };
}
