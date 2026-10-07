import {
  KNOWLEDGE_ROUTES,
  type AgentName,
  type KnowledgeRoute,
  type RouteDecision,
} from "./types.ts";

export const MAX_INPUT_LENGTH = 4000;
export const CONFIDENCE_THRESHOLD = 0.6;

export function sanitizeInput(text: string): string {
  return (
    text
      .replace(/\r\n/g, "\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "")
      .replace(/\n(?:[ \t]*\n){3,}/g, "\n\n\n")
      .trim()
  );
}

const INJECTION_PATTERNS: [string, RegExp][] = [
  [
    "ignore_instructions",
    /\b(?:ignore|forget)\s+(?:(?:all|any|the|your)\s+){0,2}(?:previous|prior|above|earlier)\s+(?:instructions?|rules?|prompts?)\b/i,
  ],
  [
    "disregard_instructions",
    /\bdisregard\s+(?:(?:all|any|the|your|previous|prior|above|earlier|system)\s+){0,3}(?:instructions?|rules?|prompts?|guidelines?)\b/i,
  ],
  ["role_override", /\byou\s+are\s+now\s+(?:an?|the|my|in|no\s+longer|dan|unrestricted)\b/i],
  [
    "act_as_role",
    /\bact\s+as\s+(?:an?\s+|the\s+)?(?:admin|administrator|receptionist|doctor|developer|system)\b/i,
  ],
  ["system_prompt", /\bsystem\s+prompt\b/i],
  [
    "reveal_prompt",
    /\b(?:reveal|show|print|repeat|output)\s+(?:me\s+)?your\s+(?:system\s+|hidden\s+|initial\s+)?(?:prompt|instructions)\b/i,
  ],
  ["developer_mode", /\bdev(?:eloper)?\s+mode\b/i],
  ["jailbreak", /\bjail\s*break/i],
  ["pretend_role", /\bpretend\s+(?:to\s+be|you\s+are|you're)\b/i],
  ["special_tokens", /<\|im_(?:start|end)\|>|<\|(?:system|endoftext)\|>|\[\/?INST\]|<<\/?SYS>>/i],
  ["role_claim", /\bi\s*(?:am|'m)\s+(?:the|a|an)\s+(?:receptionist|doctor|admin|administrator)\b/i],
];

export function detectInjection(text: string): { flagged: boolean; patterns: string[] } {
  const patterns = INJECTION_PATTERNS.filter(([, regex]) => regex.test(text)).map(([name]) => name);
  return { flagged: patterns.length > 0, patterns };
}

export type PiiMap = Map<string, string>;
type PiiKind = "EMAIL" | "PHONE" | "NID" | "DOB";

const PLACEHOLDER = /\[(?:EMAIL|PHONE|NID|DOB)_\d+\]/g;
const PROTECTED = new RegExp(
  `([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|${PLACEHOLDER.source})`,
  "gi",
);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BD_PHONE = /(?<![\d+])(?:\+?880[\s-]?|0)1[3-9](?:[\s-]?\d){8}(?!\d)/g;
const INTL_PHONE = /(?<![\d+])\+\d(?:[\s-]?\d){9,14}(?!\d)/g;
const NID_WITH_CONTEXT =
  /(\b(?:nid|national\s+id(?:entity)?)(?:\s+(?:card|number|no\.?))?\s*(?:is|:|#|-)?\s*)(\d{17}|\d{13}|\d{10})(?!\d)/gi;
const NID_STANDALONE = /(?<!\d)(?:\d{17}|\d{13})(?!\d)/g;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const DOB = new RegExp(
  `(\\b(?:born(?:\\s+on)?|dob|d\\.o\\.b\\.?|date\\s+of\\s+birth)\\s*(?:is|:|-)?\\s*)` +
    `(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|` +
    `\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH},?\\s+\\d{4}|${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})`,
  "gi",
);

function placeholderFor(kind: PiiKind, value: string, map: PiiMap): string {
  const prefix = `[${kind}_`;
  let highest = 0;
  for (const [key, original] of map) {
    if (!key.startsWith(prefix)) continue;
    if (original === value) return key;
    highest = Math.max(highest, Number(key.slice(prefix.length, -1)) || 0);
  }
  const key = `${prefix}${highest + 1}]`;
  map.set(key, value);
  return key;
}

/** Applies `fn` only to text outside UUIDs and existing placeholders. */
function mapUnprotected(text: string, fn: (chunk: string) => string): string {
  return text
    .split(PROTECTED)
    .map((chunk, index) => (index % 2 === 1 ? chunk : fn(chunk)))
    .join("");
}

export function redactPii(text: string, map?: PiiMap): { text: string; map: PiiMap } {
  const result: PiiMap = new Map(map);
  const replace = (kind: PiiKind) => (match: string) => placeholderFor(kind, match, result);
  const replaceTail = (kind: PiiKind) => (_match: string, lead: string, value: string) =>
    lead + placeholderFor(kind, value, result);

  const redacted = mapUnprotected(text, (chunk) =>
    chunk
      .replace(EMAIL, replace("EMAIL"))
      .replace(NID_WITH_CONTEXT, replaceTail("NID"))
      .replace(DOB, replaceTail("DOB"))
      .replace(BD_PHONE, replace("PHONE"))
      .replace(INTL_PHONE, replace("PHONE"))
      .replace(NID_STANDALONE, replace("NID")),
  );
  return { text: redacted, map: result };
}

/** Like redactPii, but adds new placeholders to `map` so one map serves a whole request. */
export function redactInto(text: string, map: PiiMap): string {
  const result = redactPii(text, map);
  for (const [key, value] of result.map) map.set(key, value);
  return result.text;
}

export function restorePii(text: string, map: PiiMap): string {
  return text.replace(PLACEHOLDER, (placeholder) => map.get(placeholder) ?? placeholder);
}

function restoreValue(value: unknown, map: PiiMap): unknown {
  if (typeof value === "string") return restorePii(value, map);
  if (Array.isArray(value)) return value.map((item) => restoreValue(item, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, restoreValue(item, map)]),
    );
  }
  return value;
}

export function restorePiiInArgs(
  args: Record<string, unknown>,
  map: PiiMap,
): Record<string, unknown> {
  return restoreValue(args, map) as Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function extractJsonObject(raw: unknown): Record<string, unknown> | null {
  if (isRecord(raw)) return raw;
  if (typeof raw !== "string") return null;
  const body = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(body.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseConfidence(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

export function parseRouteDecision(
  raw: unknown,
  options: { allowedAgents: AgentName[]; okfIds: string[] },
): RouteDecision | null {
  const json = extractJsonObject(raw);
  if (!json) return null;

  const isAllowed = (value: unknown): value is AgentName =>
    typeof value === "string" && options.allowedAgents.includes(value as AgentName);
  const agent = typeof json.agent === "string" ? json.agent.trim().toLowerCase() : null;
  if (!isAllowed(agent)) return null;

  const confidence = parseConfidence(json.confidence);
  if (confidence === null) return null;

  const knowledgeRaw = json.knowledge ?? "none";
  if (!KNOWLEDGE_ROUTES.includes(knowledgeRaw as KnowledgeRoute)) return null;
  let knowledge = knowledgeRaw as KnowledgeRoute;
  let okfId: string | null = null;
  if (knowledge === "okf") {
    if (typeof json.okf_id === "string" && options.okfIds.includes(json.okf_id)) {
      okfId = json.okf_id;
    } else {
      knowledge = "rag";
    }
  }

  const handoffs = Array.isArray(json.handoffs)
    ? [...new Set(json.handoffs.filter(isAllowed))].filter((name) => name !== agent).slice(0, 2)
    : [];

  const question =
    typeof json.clarifying_question === "string"
      ? json.clarifying_question.trim().slice(0, 300).trim()
      : "";

  return {
    agent,
    handoffs,
    knowledge,
    okf_id: okfId,
    confidence,
    clarifying_question: question || null,
    source: "model",
  };
}

export function needsClarification(decision: RouteDecision): boolean {
  return decision.confidence < CONFIDENCE_THRESHOLD;
}

const TOOL_CALL_TEXT = /<tool_call>|<function=|<\/?parameter/i;
const DOSE_PATTERNS = [
  /\btake\s+\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g)\b/i,
  /\b\d+(?:\.\d+)?\s?mg\s+(?:twice|once|three\s+times|every)\b/i,
  /\btablets?\s+(?:a|per)\s+day\b/i,
];

function containsRawContact(text: string): boolean {
  let found = false;
  mapUnprotected(text, (chunk) => {
    if ([EMAIL, BD_PHONE, INTL_PHONE].some((regex) => chunk.match(regex))) found = true;
    return chunk;
  });
  return found;
}

export function checkFinalText(
  text: string,
): { ok: true } | { ok: false; reason: "pii" | "dose" | "tool_call_text" } {
  if (TOOL_CALL_TEXT.test(text)) return { ok: false, reason: "tool_call_text" };
  if (containsRawContact(text)) return { ok: false, reason: "pii" };
  if (DOSE_PATTERNS.some((regex) => regex.test(text))) return { ok: false, reason: "dose" };
  return { ok: true };
}
