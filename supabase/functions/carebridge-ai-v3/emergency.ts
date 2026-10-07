import type { OkfDoc } from "./types.ts";

export const EMERGENCY_DOC_ID = "emergency-guidance";

// Used only if the OKF emergency document is missing or empty.
const FALLBACK_TEXT =
  "If this is an emergency, call 999 now. For chest pain, trouble breathing, heavy bleeding, signs of a stroke, or thoughts of self-harm, do not wait for an appointment. CareBridge AI cannot handle emergencies.";

const PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "chest_pain", pattern: /\bchest\s+(pain|tightness|pressure)\b|\bheart\s+attack\b/i },
  {
    name: "breathing",
    pattern:
      /\b(can'?t|cannot|can not|unable to|struggling to|hard to)\s+breathe?\b|\bnot\s+breathing\b|\bchoking\b/i,
  },
  {
    name: "bleeding",
    pattern:
      /\b(heavy|severe|won'?t stop|uncontrolled)\s+bleeding\b|\bbleeding\s+(heavily|a lot|won'?t stop)\b/i,
  },
  {
    name: "stroke",
    pattern:
      /\bstroke\b|\bface\s+(is\s+)?droop|\bslurred\s+speech\b|\b(one|left|right)\s+side\s+(of\s+my\s+body\s+)?(is\s+)?(numb|weak)/i,
  },
  { name: "unconscious", pattern: /\b(unconscious|passed out|not responding|having a seizure)\b/i },
  {
    name: "self_harm",
    pattern:
      /\b(suicide|suicidal|kill myself|end my life|end it all|self[-\s]?harm|hurt myself|want to die|overdose)\b/i,
  },
  { name: "poisoning", pattern: /\b(poisoned|swallowed (bleach|poison|pills))\b/i },
];

export function detectEmergency(text: string): string[] {
  return PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
}

/** The first paragraph of the emergency OKF document, shown verbatim. */
export function emergencyReply(docs: OkfDoc[]): string {
  const doc = docs.find((candidate) => candidate.id === EMERGENCY_DOC_ID);
  const paragraph = doc?.body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith("#"));
  return paragraph || FALLBACK_TEXT;
}
