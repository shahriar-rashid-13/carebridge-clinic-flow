import { callGateway, MODEL_ALIAS } from "../carebridge-ai-v2/gateway.ts";
import type { ToolContext } from "../carebridge-ai-v2/shared.ts";
import {
  RESULT_COUNT,
  hybridRetrieve,
  type Candidate,
  type HybridRetrieveOutcome,
} from "./retrieve.ts";

export const PLAN_TIMEOUT_MS = 6_000;
export const SUPPORT_TIMEOUT_MS = 6_000;
export const MAX_PLAN_QUERIES = 2;
export const MAX_FOLLOWUPS = 2;
export const MAX_HOPS = 2;

export const REFUSE_MESSAGE =
  "I could not find clinic knowledge that answers this. I do not know, and I will not guess. Please ask the clinic or a doctor.";

/** Signals that usually need more than one retrieval hop. */
const COMPLEX_PATTERN =
  /\b(and|also|plus|both|compare|versus|vs\.?|difference|as well as|then|after that|before that|in addition|along with|what about|how (?:does|do|is|are).+\b(?:and|versus|vs)\b)\b/i;

export type QueryPlan = {
  complex: boolean;
  queries: string[];
  reason: string;
  source: "heuristic" | "model" | "fallback";
};

export type SupportAssessment = {
  supported: boolean;
  reason: string;
  source: "empty" | "model" | "fallback";
};

export type AgenticHop = {
  hop: number;
  query: string;
  mode: HybridRetrieveOutcome["mode"];
  ranking: HybridRetrieveOutcome["ranking"];
  candidates: number;
  results: number;
  error?: string;
};

export type CitedResult = {
  citation: string;
  source: string;
  specialization: string | null;
  diagnosis: string | null;
  text: string;
  relevance: number | null;
};

export type AgenticSearchResult = {
  ok: true;
  mode: HybridRetrieveOutcome["mode"] | "none";
  ranking: HybridRetrieveOutcome["ranking"] | "none";
  candidates: number;
  results: CitedResult[];
  supported: boolean;
  refused: boolean;
  message: string;
  agentic: {
    complex: boolean;
    plan_source: QueryPlan["source"];
    plan_reason: string;
    queries: string[];
    hops: AgenticHop[];
    support_source: SupportAssessment["source"];
    support_reason: string;
  };
};

const SOURCE_LABEL: Record<string, string> = {
  faq: "Clinic FAQ",
  visit_note: "Anonymised past visit note (another patient)",
  prescription: "Anonymised past prescription (another patient)",
};

export function looksComplex(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length > 120) return true;
  const questions = (trimmed.match(/\?/g) ?? []).length;
  if (questions >= 2) return true;
  return COMPLEX_PATTERN.test(trimmed);
}

export function planPrompt(question: string): string {
  return [
    "Split a clinic knowledge question into short search queries.",
    "Use 1 query when the question is simple. Use 2 only when it clearly asks two different facts.",
    "Do not invent clinic facts. Keep each query under 120 characters.",
    `Question: ${question}`,
    'Reply with only JSON like {"complex": true, "queries": ["fees for cardiology", "how to pay"], "reason": "asks fee and payment"}.',
  ].join("\n");
}

export function followUpPrompt(question: string, evidence: Candidate[]): string {
  const list = evidence
    .slice(0, RESULT_COUNT)
    .map(
      (row, index) =>
        `[${index + 1}] ${row.doc_id}: ${row.text.slice(0, 220).replace(/\s+/g, " ")}`,
    )
    .join("\n");
  return [
    "You plan a second clinic-knowledge search hop. Suggest follow-up queries only for facts the question still needs that the passages do not cover.",
    "If the passages already cover the question, return an empty queries list.",
    "At most 2 short queries. Do not invent clinic facts.",
    `Question: ${question}`,
    "Passages:",
    list || "(none)",
    'Reply with only JSON like {"queries": ["waitlist expiry"], "reason": "first hop covered booking but not waitlist"}.',
  ].join("\n");
}

export function supportPrompt(question: string, evidence: Candidate[]): string {
  const list = evidence
    .map(
      (row, index) =>
        `[${index + 1}] ${row.doc_id}: ${row.text.slice(0, 280).replace(/\s+/g, " ")}`,
    )
    .join("\n");
  return [
    "Decide whether the passages are enough to answer the question without guessing.",
    "supported=true only when the passages directly answer the question. Otherwise supported=false.",
    `Question: ${question}`,
    "Passages:",
    list || "(none)",
    'Reply with only JSON like {"supported": false, "reason": "passages discuss fees, not parking"}.',
  ].join("\n");
}

function readJsonObject(raw: string | null): Record<string, unknown> | null {
  const match = raw?.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function cleanQueries(values: unknown, fallback: string[], limit: number): string[] {
  if (!Array.isArray(values)) return fallback;
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const query = value.trim().replace(/\s+/g, " ").slice(0, 300);
    if (!query || out.some((existing) => existing.toLowerCase() === query.toLowerCase())) continue;
    out.push(query);
    if (out.length >= limit) break;
  }
  return out.length ? out : fallback;
}

/** Reads a planner reply; returns null when the JSON is unusable. */
export function parsePlan(raw: string | null, question: string): QueryPlan | null {
  const parsed = readJsonObject(raw);
  if (!parsed) return null;
  const queries = cleanQueries(parsed.queries, [], MAX_PLAN_QUERIES);
  if (!queries.length) return null;
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 200) : "";
  return {
    complex: parsed.complex === true || queries.length > 1 || looksComplex(question),
    queries,
    reason: reason || "model plan",
    source: "model",
  };
}

/** Reads follow-up queries for hop 2; empty list means stop. */
export function parseFollowUps(raw: string | null): string[] {
  const parsed = readJsonObject(raw);
  if (!parsed) return [];
  return cleanQueries(parsed.queries, [], MAX_FOLLOWUPS);
}

/** Reads a groundedness reply; returns null when the JSON is unusable. */
export function parseSupport(raw: string | null): SupportAssessment | null {
  const parsed = readJsonObject(raw);
  if (!parsed || typeof parsed.supported !== "boolean") return null;
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 200) : "";
  return {
    supported: parsed.supported,
    reason: reason || (parsed.supported ? "passages answer the question" : "passages do not answer"),
    source: "model",
  };
}

export function heuristicPlan(question: string): QueryPlan {
  const complex = looksComplex(question);
  return {
    complex,
    queries: [question.trim()],
    reason: complex ? "complex markers; waiting for model split" : "single-topic question",
    source: "heuristic",
  };
}

export async function planQueries(question: string): Promise<QueryPlan> {
  const base = heuristicPlan(question);
  if (!base.complex) return base;

  const result = await callGateway({
    model: MODEL_ALIAS,
    messages: [{ role: "user", content: planPrompt(question) }],
    timeoutMs: PLAN_TIMEOUT_MS,
  });
  if (!result.ok) {
    return { ...base, reason: result.detail, source: "fallback" };
  }
  return (
    parsePlan(result.content, question) ?? {
      ...base,
      reason: "invalid plan",
      source: "fallback",
    }
  );
}

export async function planFollowUps(question: string, evidence: Candidate[]): Promise<string[]> {
  if (!evidence.length) return [];
  const result = await callGateway({
    model: MODEL_ALIAS,
    messages: [{ role: "user", content: followUpPrompt(question, evidence) }],
    timeoutMs: PLAN_TIMEOUT_MS,
  });
  if (!result.ok) return [];
  return parseFollowUps(result.content);
}

export async function assessSupport(
  question: string,
  evidence: Candidate[],
): Promise<SupportAssessment> {
  if (!evidence.length) {
    return {
      supported: false,
      reason: "no matching passages",
      source: "empty",
    };
  }

  const result = await callGateway({
    model: MODEL_ALIAS,
    messages: [{ role: "user", content: supportPrompt(question, evidence) }],
    timeoutMs: SUPPORT_TIMEOUT_MS,
  });
  if (!result.ok) {
    // Prefer refusal over guessing when the judge is down.
    return {
      supported: false,
      reason: result.detail,
      source: "fallback",
    };
  }
  return (
    parseSupport(result.content) ?? {
      supported: false,
      reason: "invalid support judgment",
      source: "fallback",
    }
  );
}

function toCited(row: Candidate): CitedResult {
  return {
    citation: `[${row.doc_id}]`,
    source: SOURCE_LABEL[row.record_type] ?? "Clinic knowledge",
    specialization: row.specialization,
    diagnosis: row.diagnosis,
    text: row.text,
    relevance: row.similarity,
  };
}

/** Keeps the highest-similarity copy of each document, then the top RESULT_COUNT. */
export function mergeCandidates(groups: Candidate[][]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const group of groups) {
    for (const row of group) {
      const previous = best.get(row.doc_id);
      if (!previous || (row.similarity ?? -1) > (previous.similarity ?? -1)) {
        best.set(row.doc_id, row);
      }
    }
  }
  return [...best.values()]
    .sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1))
    .slice(0, RESULT_COUNT);
}

async function retrieveQueries(
  queries: string[],
  hop: number,
  filters: { recordType: string | null; specialization: string | null },
  ctx: ToolContext,
): Promise<{ groups: Candidate[][]; hops: AgenticHop[]; mode: HybridRetrieveOutcome["mode"] | "none" }> {
  const hops: AgenticHop[] = [];
  const groups: Candidate[][] = [];
  let mode: HybridRetrieveOutcome["mode"] | "none" = "none";

  for (const query of queries) {
    const outcome = await hybridRetrieve(query, filters, ctx);
    if (mode === "none") mode = outcome.mode;
    else if (outcome.mode === "gte") mode = "gte";
    else if (mode !== "gte" && outcome.mode === "gemini") mode = "gemini";
    groups.push(outcome.results);
    hops.push({
      hop,
      query,
      mode: outcome.mode,
      ranking: outcome.ranking,
      candidates: outcome.candidates,
      results: outcome.results.length,
      ...(outcome.error ? { error: outcome.error } : {}),
    });
  }

  return { groups, hops, mode };
}

/**
 * Agentic clinic-knowledge search: plan → multi-hop hybrid retrieve → refuse when unsupported.
 * Remains inside the Edge Function trust boundary (caller JWT + RLS via ctx.db).
 */
export async function agenticSearch(
  question: string,
  filters: { recordType: string | null; specialization: string | null },
  ctx: ToolContext,
): Promise<AgenticSearchResult> {
  const plan = await planQueries(question);
  const hopTrace: AgenticHop[] = [];

  const first = await retrieveQueries(plan.queries, 1, filters, ctx);
  hopTrace.push(...first.hops);
  let merged = mergeCandidates(first.groups);
  let mode = first.mode;
  let ranking: HybridRetrieveOutcome["ranking"] | "none" = first.hops[0]?.ranking ?? "none";

  if (plan.complex && merged.length && MAX_HOPS > 1) {
    const followUps = await planFollowUps(question, merged);
    if (followUps.length) {
      const second = await retrieveQueries(followUps, 2, filters, ctx);
      hopTrace.push(...second.hops);
      merged = mergeCandidates([...first.groups, ...second.groups]);
      if (second.mode === "gte" || (mode === "none" && second.mode !== "none")) mode = second.mode;
      ranking = second.hops.some((hop) => hop.ranking === "reranked")
        ? "reranked"
        : (second.hops[0]?.ranking ?? ranking);
    }
  } else if (first.hops.some((hop) => hop.ranking === "reranked")) {
    ranking = "reranked";
  } else if (first.hops.length) {
    ranking = first.hops[0]!.ranking;
  }

  const support = await assessSupport(question, merged);
  const candidates = hopTrace.reduce((sum, hop) => sum + hop.candidates, 0);

  if (!support.supported) {
    return {
      ok: true,
      mode,
      ranking,
      candidates,
      results: [],
      supported: false,
      refused: true,
      message: REFUSE_MESSAGE,
      agentic: {
        complex: plan.complex,
        plan_source: plan.source,
        plan_reason: plan.reason,
        queries: plan.queries,
        hops: hopTrace,
        support_source: support.source,
        support_reason: support.reason,
      },
    };
  }

  return {
    ok: true,
    mode,
    ranking,
    candidates,
    results: merged.map(toCited),
    supported: true,
    refused: false,
    message:
      "Answer only from these results and cite each fact with its citation, for example [FAQ-000021]. If a needed fact is missing, say you do not know.",
    agentic: {
      complex: plan.complex,
      plan_source: plan.source,
      plan_reason: plan.reason,
      queries: plan.queries,
      hops: hopTrace,
      support_source: support.source,
      support_reason: support.reason,
    },
  };
}
