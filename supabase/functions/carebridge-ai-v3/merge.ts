// Joins the replies of several specialists into one answer for the user.

// "I can't look that up" style replies. Refusals such as "I cannot give a diagnosis" are kept.
const CANNOT_HELP =
  /\bi (?:do not|don't) have access\b|\bi (?:cannot|can't|am unable to|am not able to) (?:access|see|look up|check|find)\b|\bnot available (?:to|in) my (?:current )?tools\b/i;
const MIN_SENTENCE_WORDS = 6;
const REPEAT_SHARE = 0.75;
const MIN_LEFTOVER_WORDS = 10;
const MIN_FRAGMENT_WORDS = 3;

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

function splitSentences(line: string): string[] {
  return line.split(/(?<!\b(?:Dr|Mr|Mrs|Ms|Prof)\.)(?<=[.!?])\s+(?=[A-Z*[(])/);
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
  const rest = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return words(rest).length < MIN_FRAGMENT_WORDS ? "" : rest;
}

/** Removes "cannot look that up" sentences; a reply with little else left becomes empty. */
function dropCannotHelp(text: string): string {
  if (!CANNOT_HELP.test(text)) return text;
  const rest = text
    .split("\n")
    .map((line) =>
      splitSentences(line)
        .filter((sentence) => !CANNOT_HELP.test(sentence))
        .join(" "),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return words(rest).length >= MIN_LEFTOVER_WORDS ? rest : "";
}

/**
 * Merges specialist replies in order. "Cannot look that up" sentences are removed when another
 * specialist answered, a reply left empty is dropped, and sentences that restate an earlier reply
 * are removed.
 */
export function mergeAgentTexts(texts: string[]): string | null {
  const replies = texts.map((text) => text.trim().replace(/[\u2018\u2019]/g, "'")).filter(Boolean);
  if (replies.length <= 1) return replies[0] ?? null;

  const helpful = replies.map(dropCannotHelp).filter(Boolean);
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
