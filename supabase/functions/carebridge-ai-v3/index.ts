import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { GatewayMessage } from "../carebridge-ai-v2/gateway.ts";
import { reportError, type ErrorReport } from "../carebridge-ai-v2/sentry.ts";
import { isUuid, ROLES, todayIn, type Role, type ToolContext } from "../carebridge-ai-v2/shared.ts";
import { toolsForRole } from "../carebridge-ai-v2/tools.ts";
import { agentPrompt, agentsForRole, toolsForAgent } from "./agents.ts";
import { confirmOrCancel } from "./confirm.ts";
import { detectEmergency, emergencyReply } from "./emergency.ts";
import {
  checkFinalText,
  detectInjection,
  MAX_INPUT_LENGTH,
  needsClarification,
  redactInto,
  redactPii,
  restorePii,
  sanitizeInput,
  type PiiMap,
} from "./guardrails.ts";
import { mergeAgentTexts } from "./merge.ts";
import { loadOkf, publicContacts } from "./okf.ts";
import { runAgent, type AgentRun } from "./run-agent.ts";
import { loadState, mergeState, saveState } from "./state.ts";
import { routeMessage } from "./supervisor.ts";
import { searchKnowledge } from "./tools-knowledge.ts";
import { createGetPolicy } from "./tools-policy.ts";
import type { AgentName, ConversationState, RouteDecision } from "./types.ts";

type ChatMessage = { role: "user" | "assistant"; content: string };
type StatePatch = { [K in keyof ConversationState]?: ConversationState[K] | null };

const MAX_HISTORY_MESSAGES = 16;
const MAX_HISTORY_LENGTH = 24000;
const TOTAL_BUDGET_MS = 120_000;
const MAX_HANDOFFS = 2;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;
const DEFAULT_RATE_LIMIT_PER_DAY = 1000;
const DEFAULT_CLINIC_TIMEZONE = "Asia/Dhaka";
const LEGACY_PROPOSAL_MARKER =
  /<carebridge-booking-proposal>[\s\S]*?<\/carebridge-booking-proposal>/g;
const TEXT_TOOL_CALL = /<tool_call>|<function=|<\/?parameter/i;
const PII_PLACEHOLDER = /\[(EMAIL|PHONE|NID|DOB)_\d+\]/g;
const DOSE_REPLY =
  "I can't give advice on which medicine or dose to take. Only a doctor can prescribe, so please ask your doctor or pharmacist.";

const OKF_DOCS = loadOkf();
const GET_POLICY = createGetPolicy(OKF_DOCS);
const PUBLIC_CONTACTS = publicContacts(OKF_DOCS);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const positiveIntEnv = (name: string, fallback: number) => {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

function trimHistory(rows: ChatMessage[]): ChatMessage[] {
  const cleaned = rows
    .map((row) => ({
      role: row.role,
      content: row.content.replace(LEGACY_PROPOSAL_MARKER, "").trim(),
    }))
    .filter(
      (row) =>
        row.content.length > 0 && !(row.role === "assistant" && TEXT_TOOL_CALL.test(row.content)),
    );
  const kept: ChatMessage[] = [];
  let total = 0;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const row = cleaned[i]!;
    if (total + row.content.length > MAX_HISTORY_LENGTH) break;
    total += row.content.length;
    kept.unshift(row);
  }
  while (kept.length > 0 && kept[0]!.role !== "user") kept.shift();
  return kept;
}

async function countAssistantMessagesSince(
  db: SupabaseClient,
  userId: string,
  since: Date,
): Promise<number | null> {
  const { count, error } = await db
    .from("ai_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "assistant")
    .gte("created_at", since.toISOString());
  return error ? null : (count ?? 0);
}

/** Final reply checks: printed tool calls, dosing advice, and PII the user did not share. */
export function finishText(
  text: string | null,
  pii: PiiMap,
  hasProposals: boolean,
  allowedContacts: string[] = PUBLIC_CONTACTS,
): { text: string | null; flag?: string } {
  if (!text)
    return {
      text: hasProposals
        ? "Please review the proposal below and press Confirm if it is correct."
        : null,
    };
  const contacts = new Map(
    allowedContacts.map((contact, index) => [`[CLINIC_${index + 1}]`, contact]),
  );
  for (const [token, contact] of contacts) text = text.split(contact).join(token);
  const putBack = (value: string) => {
    for (const [token, contact] of contacts) value = value.split(token).join(contact);
    return value;
  };
  const result = checkReply(text, pii, hasProposals);
  return { ...result, text: putBack(result.text) };
}

function checkReply(
  text: string,
  pii: PiiMap,
  hasProposals: boolean,
): { text: string; flag?: string } {
  const check = checkFinalText(text);
  if (!check.ok) {
    if (check.reason === "tool_call_text") {
      return {
        text: hasProposals
          ? "Please review the proposal below and press Confirm if it is correct."
          : "Sorry, I could not prepare that request. Please send your last message again.",
        flag: check.reason,
      };
    }
    if (check.reason === "dose") return { text: DOSE_REPLY, flag: check.reason };
    const hidden = redactPii(text, new Map()).text.replace(PII_PLACEHOLDER, "[hidden]");
    return { text: restorePii(hidden, pii), flag: check.reason };
  }
  return { text: restorePii(text, pii) };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const requestId = crypto.randomUUID();
  const fail = (status: number, error: string, detail?: string) => {
    if (detail) console.error(JSON.stringify({ request_id: requestId, status, detail }));
    if (status >= 500) reportInBackground({ message: error, detail, status, requestId });
    return json({ error, request_id: requestId }, status);
  };

  if (req.method !== "POST") return fail(405, "Method not allowed.");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return fail(401, "Missing or invalid authorization.");
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey)
    return fail(500, "AI service is not configured.", "missing supabase env");

  const db = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return fail(401, "Invalid or expired session.");
  const userId = userData.user.id;

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return fail(500, "Could not load your profile.", profileError.message);
  if (!profile || !ROLES.includes(profile.role))
    return fail(403, "Your clinic profile is not ready.");
  const role = profile.role as Role;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const rawConversationId = input["conversation_id"];
  if (rawConversationId !== undefined && rawConversationId !== null && !isUuid(rawConversationId)) {
    return fail(400, "conversation_id must be a UUID.");
  }
  const conversationId = isUuid(rawConversationId) ? rawConversationId : null;

  let doctorId: string | null = null;
  if (role === "doctor") {
    const { data: doctor, error } = await db
      .from("doctors")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return fail(500, "Could not load your doctor record.", error.message);
    doctorId = doctor?.id ?? null;
  }

  const timeZone = Deno.env.get("CLINIC_TIMEZONE") || DEFAULT_CLINIC_TIMEZONE;
  const today = todayIn(timeZone);
  const ctx: ToolContext = { db, userId, role, doctorId, today, proposals: [] };

  // ------------------------------------------------------------ confirm / cancel
  const action = input["action"];
  if (action !== undefined) {
    if (action !== "confirm" && action !== "cancel")
      return fail(400, "action must be confirm or cancel.");
    const pendingId = input["pending_action_id"];
    if (!isUuid(pendingId)) return fail(400, "pending_action_id must be a UUID.");
    const outcome = await confirmOrCancel({
      db,
      ctx,
      action,
      pendingId,
      conversationId,
      requestId,
    });
    return outcome.ok ? json(outcome.body) : fail(outcome.status, outcome.error, outcome.detail);
  }

  // ------------------------------------------------------------ chat turn
  const message = typeof input["message"] === "string" ? sanitizeInput(input["message"]) : "";
  if (!message) return fail(400, "message is required.");
  if (message.length > MAX_INPUT_LENGTH)
    return fail(400, `message exceeds ${MAX_INPUT_LENGTH} characters.`);

  if (conversationId) {
    const { data: conversation, error } = await db
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) return fail(500, "Could not load the conversation.", error.message);
    if (!conversation) return fail(404, "Conversation not found.");
  }

  const now = Date.now();
  const [lastMinute, lastDay] = await Promise.all([
    countAssistantMessagesSince(db, userId, new Date(now - 60_000)),
    countAssistantMessagesSince(db, userId, new Date(now - 86_400_000)),
  ]);
  if (lastMinute === null || lastDay === null)
    return fail(500, "Could not check usage limits.", "rate limit count failed");
  if (lastMinute >= positiveIntEnv("AI_RATE_LIMIT_PER_MINUTE", DEFAULT_RATE_LIMIT_PER_MINUTE)) {
    return fail(429, "You are sending messages too quickly. Please wait a minute.");
  }
  if (lastDay >= positiveIntEnv("AI_RATE_LIMIT_PER_DAY", DEFAULT_RATE_LIMIT_PER_DAY)) {
    return fail(429, "Daily AI message limit reached. Please try again tomorrow.");
  }

  const startedAt = Date.now();
  const deadline = startedAt + TOTAL_BUDGET_MS;
  const metadata: Record<string, unknown> = { request_id: requestId, function_version: "v3" };
  let finalText: string | null = null;
  let nextState: ConversationState | null = null;

  const emergency = detectEmergency(message);
  if (emergency.length) {
    finalText = emergencyReply(OKF_DOCS);
    metadata["emergency"] = emergency;
  } else {
    let history: ChatMessage[] = [];
    if (conversationId) {
      const { data: rows, error } = await db
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY_MESSAGES - 1);
      if (error) return fail(500, "Could not load the conversation.", error.message);
      history = ((rows ?? []) as ChatMessage[]).reverse();
    }
    const state = await loadState(db, conversationId);

    const pii: PiiMap = new Map();
    const turns = trimHistory([...history, { role: "user", content: message }]).map((row) => ({
      role: row.role,
      content: redactInto(row.content, pii),
    }));
    const redactedMessage = turns.at(-1)!.content;
    const injection = detectInjection(message);

    const roleTools = [
      ...toolsForRole(role).map((tool) =>
        tool.name === searchKnowledge.name ? searchKnowledge : tool,
      ),
      GET_POLICY,
    ];
    const allowed = agentsForRole(role, roleTools);
    const routed = await routeMessage({
      message: redactedMessage,
      history: turns.slice(0, -1),
      role,
      allowed,
      docs: OKF_DOCS,
      state,
    });
    const decision: RouteDecision = routed.decision;
    metadata["route"] = decision;
    metadata["supervisor"] = {
      calls: routed.calls,
      model: routed.model,
      usage: routed.usage,
      error: routed.error,
    };
    if (injection.flagged) metadata["injection"] = injection.patterns;
    if (pii.size) metadata["pii_redacted"] = pii.size;

    let statePatch: StatePatch = {};
    if (needsClarification(decision) && decision.clarifying_question) {
      finalText = decision.clarifying_question;
    } else {
      const queue: AgentName[] = [decision.agent, ...decision.handoffs.slice(0, MAX_HANDOFFS)];
      const policy =
        decision.knowledge === "okf"
          ? (OKF_DOCS.find((doc) => doc.id === decision.okf_id) ?? null)
          : null;
      const runs: AgentRun[] = [];
      let unreached: AgentName[] = [];
      let useFallbackModel = false;

      for (const [index, agent] of queue.entries()) {
        const earlier = runs
          .filter((run) => run.text)
          .map((run) => `${run.agent}: ${run.text}`)
          .join("\n");
        let system = agentPrompt(
          agent,
          { role, today, timeZone, state },
          {
            policy: index === 0 ? policy : null,
            injectionFlagged: injection.flagged,
            otherAgents: queue.filter((other) => other !== agent),
          },
        );
        if (earlier)
          system += `\nAlready answered by other specialists in this reply (do not repeat):\n${earlier}`;

        const outcome = await runAgent({
          agent,
          system,
          messages: turns,
          tools: toolsForAgent(agent, roleTools),
          ctx,
          pii,
          deadline,
          requestId,
          useFallbackModel,
        });
        if (!outcome.ok) {
          if (runs.length === 0) return fail(outcome.status, outcome.error, outcome.detail);
          unreached = queue.slice(index);
          break;
        }
        runs.push(outcome.run);
        if (outcome.run.fallbackCalls > 0) useFallbackModel = true;
      }

      const texts = runs.map((run) => run.text).filter((text): text is string => Boolean(text));
      finalText = mergeAgentTexts(texts);
      statePatch = {
        ...Object.assign({}, ...runs.map((run) => run.learned)),
        last_agent: runs.at(-1)?.agent ?? decision.agent,
        pending_intents: unreached.length ? unreached : null,
      };
      if (unreached.length) {
        finalText =
          `${finalText ?? ""}\n\nI ran out of time before the ${unreached.join(" and ")} part. Please ask about it again.`.trim();
      }
      metadata["agents"] = runs.map((run) => run.agent);
      metadata["models"] = runs.flatMap((run) => run.models);
      metadata["model"] = runs.at(-1)?.models.at(-1) ?? null;
      metadata["usage"] = runs.flatMap((run) => run.usage);
      metadata["tools"] = runs.flatMap((run) => run.tools);
      metadata["fallback_calls"] = runs.reduce((sum, run) => sum + run.fallbackCalls, 0);
      metadata["proposals"] = ctx.proposals;
    }

    const finished = finishText(finalText, pii, ctx.proposals.length > 0);
    finalText = finished.text;
    if (finished.flag) metadata["output_guard"] = finished.flag;
    nextState = mergeState(state, statePatch);
  }

  if (!finalText) return fail(502, "AI service returned an empty reply.", "empty final text");
  metadata["latency_ms"] = Date.now() - startedAt;

  const { data: saved, error: saveError } = await db.rpc("ai_append_turn", {
    p_conversation_id: conversationId,
    p_user_text: message,
    p_assistant_text: finalText,
    p_metadata: metadata,
  });
  if (saveError) {
    if (saveError.code === "P0002") return fail(404, "Conversation not found.");
    return fail(500, "The reply could not be saved. Please try again.", saveError.message);
  }
  if (nextState) await saveState(db, saved.conversation_id, nextState);

  return json({
    text: finalText,
    request_id: requestId,
    conversation_id: saved.conversation_id,
    user_message_id: saved.user_message_id,
    message_id: saved.assistant_message_id,
    proposals: ctx.proposals,
    route: metadata["route"] ?? null,
  });
}

function reportInBackground(report: ErrorReport) {
  const pending = reportError(report);
  // Keeps the worker alive until the Sentry request finishes after the response is sent.
  (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(
    pending,
  );
}

export async function safeHandler(req: Request): Promise<Response> {
  try {
    return await handler(req);
  } catch (err) {
    reportInBackground({ message: err instanceof Error ? err.message : String(err), status: 500 });
    console.error(err);
    return json({ error: "AI service is unavailable." }, 500);
  }
}

Deno.serve(safeHandler);
