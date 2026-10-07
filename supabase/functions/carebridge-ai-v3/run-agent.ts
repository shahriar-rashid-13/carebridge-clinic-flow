import {
  callGateway,
  FALLBACK_MODEL_ALIAS,
  MODEL_ALIAS,
  type GatewayMessage,
  type ToolCall,
} from "../carebridge-ai-v2/gateway.ts";
import type { ToolContext, ToolDefinition } from "../carebridge-ai-v2/shared.ts";
import { executeToolCall, toolSchemas, type ToolTrace } from "../carebridge-ai-v2/tools.ts";
import { redactInto, restorePiiInArgs, type PiiMap } from "./guardrails.ts";
import type { AgentName, ConversationState } from "./types.ts";

const GATEWAY_TIMEOUT_MS = 55_000;
const MIN_CALL_BUDGET_MS = 5_000;
const MAX_TOOL_ROUNDS = 4;
const MAX_TOOL_CALLS_PER_ROUND = 6;

export type AgentRun = {
  agent: AgentName;
  text: string | null;
  models: (string | null)[];
  usage: unknown[];
  tools: (ToolTrace & { agent: AgentName })[];
  fallbackCalls: number;
  /** Context learned from tool arguments, written to shared memory. */
  learned: Partial<ConversationState>;
};

export type AgentFailure = { ok: false; status: number; error: string; detail: string };

/** Pulls doctor, date, specialization, and patient from tool arguments. */
export function learnFromArgs(args: Record<string, unknown>): Partial<ConversationState> {
  const learned: Partial<ConversationState> = {};
  const text = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : undefined);
  const doctorId = text("doctor_id");
  const date = text("date") ?? text("appointment_date") ?? text("new_date");
  const specialization = text("specialization");
  const patientId = text("patient_id");
  if (doctorId) learned.doctor_id = doctorId;
  if (date) learned.date = date;
  if (specialization) learned.specialization = specialization;
  if (patientId) learned.patient_id = patientId;
  return learned;
}

function prepareCall(call: ToolCall, pii: PiiMap, learned: Partial<ConversationState>): ToolCall {
  try {
    const parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return call;
    const args = restorePiiInArgs(parsed, pii);
    Object.assign(learned, learnFromArgs(args));
    return { ...call, function: { ...call.function, arguments: JSON.stringify(args) } };
  } catch {
    return call;
  }
}

export async function runAgent(options: {
  agent: AgentName;
  system: string;
  messages: GatewayMessage[];
  tools: ToolDefinition[];
  ctx: ToolContext;
  pii: PiiMap;
  deadline: number;
  requestId: string;
  useFallbackModel: boolean;
}): Promise<{ ok: true; run: AgentRun } | AgentFailure> {
  const { agent, tools, ctx, pii, deadline, requestId } = options;
  const schemas = toolSchemas(tools);
  const conversation: GatewayMessage[] = [
    { role: "system", content: options.system },
    ...options.messages,
  ];
  const run: AgentRun = {
    agent,
    text: null,
    models: [],
    usage: [],
    tools: [],
    fallbackCalls: 0,
    learned: {},
  };
  let modelAlias = options.useFallbackModel ? FALLBACK_MODEL_ALIAS : MODEL_ALIAS;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_CALL_BUDGET_MS) {
      return {
        ok: false,
        status: 504,
        error: "AI service timed out. Please try again.",
        detail: "total budget exhausted",
      };
    }
    const lastRound = round === MAX_TOOL_ROUNDS;
    const result = await callGateway({
      model: modelAlias,
      messages: conversation,
      tools: schemas,
      toolChoice: lastRound ? "none" : "auto",
      timeoutMs: Math.min(GATEWAY_TIMEOUT_MS, remaining),
    });
    if (!result.ok) return result;
    run.models.push(result.model);
    run.usage.push(result.usage);
    if (result.servedByFallback) {
      run.fallbackCalls++;
      modelAlias = FALLBACK_MODEL_ALIAS;
    }

    if (result.toolCalls.length === 0 || lastRound) {
      run.text = result.content?.trim() || null;
      break;
    }

    conversation.push(result.rawMessage);
    for (const [index, call] of result.toolCalls.entries()) {
      if (index >= MAX_TOOL_CALLS_PER_ROUND) {
        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, message: "Too many tool calls in one step." }),
        });
        continue;
      }
      const { content, trace } = await executeToolCall(
        prepareCall(call, pii, run.learned),
        tools,
        ctx,
        requestId,
      );
      run.tools.push({ ...trace, agent });
      conversation.push({ role: "tool", tool_call_id: call.id, content: redactInto(content, pii) });
    }
  }
  return { ok: true, run };
}
