// Joins the replies of several specialists into one answer for the user.

// "I can't look that up" style replies. Refusals such as "I cannot give a diagnosis" are kept.
const CANNOT_HELP =
  /\bi (?:do not|don't) have access\b|\bi (?:cannot|can't|am unable to|am not able to) (?:access|see|look up|check|find)\b|\bnot available (?:to|in) my (?:current )?tools\b/i;
const MIN_SENTENCE_WORDS = 6;
const REPEAT_SHARE = 0.75;

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

function splitSentences(line: string): string[] {
  return line.split(/(?<=[.!?])\s+(?=[A-Z*[(])/);
}

/** True when most words of the sentence already appear in the earlier text. */
function isRepeat(sentence: string, seen: Set<string>): boolean {
  const list = words(sentence);
  if (list.length < MIN_SENTENCE_WORDS) return false;
  const known = list.filter((word) => seen.has(word)).length;
  return known / list.length >= REPEAT_SHARE;
}

function dropRepeats(text: string, seen: Set<string>): string {
  const lines = text.split("\n").map((line) => {
    const kept = splitSentences(line).filter((sentence) => !isRepeat(sentence, seen));
    return kept.join(" ");
  });
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Merges specialist replies in order. A reply that only says it cannot help is dropped when
 * another specialist answered, and sentences that restate an earlier reply are removed.
 */
export function mergeAgentTexts(texts: string[]): string | null {
  const replies = texts.map((text) => text.trim()).filter(Boolean);
  if (replies.length <= 1) return replies[0] ?? null;

  const helpful = replies.filter((text) => !CANNOT_HELP.test(text));
  const chosen = helpful.length ? helpful : replies.slice(0, 1);

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const [index, text] of chosen.entries()) {
    const kept = index === 0 ? text : dropRepeats(text, seen);
    if (!kept) continue;
    merged.push(kept);
    for (const word of words(kept)) seen.add(word);
  }
  return merged.join("\n\n") || null;
}
