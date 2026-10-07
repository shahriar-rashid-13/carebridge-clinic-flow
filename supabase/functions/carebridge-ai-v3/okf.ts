import { OKF_SOURCES } from "./knowledge.gen.ts";
import type { OkfDoc } from "./types.ts";

const OKF_TYPES: OkfDoc["type"][] = ["policy", "guidance", "faq"];
const REQUIRED_KEYS = [
  "id",
  "type",
  "title",
  "description",
  "owner",
  "tags",
  "aliases",
  "timestamp",
] as const;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class OkfParseError extends Error {}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function parseList(value: string, key: string): string[] {
  const match = value.match(/^\[(.*)\]$/);
  if (!match) throw new OkfParseError(`${key} must be an inline list like [a, b].`);
  return match[1]!
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Parses one OKF Markdown file: a frontmatter block of `key: value` lines, then the body. */
export function parseOkf(source: string): OkfDoc {
  const match = source.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new OkfParseError("Missing frontmatter block.");

  const fields: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator < 1) throw new OkfParseError(`Invalid frontmatter line: ${line}`);
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  for (const key of REQUIRED_KEYS) {
    if (!fields[key]) throw new OkfParseError(`Missing frontmatter key: ${key}`);
  }

  const id = fields["id"]!;
  if (!ID_PATTERN.test(id)) throw new OkfParseError(`Invalid id: ${id}`);
  const type = fields["type"] as OkfDoc["type"];
  if (!OKF_TYPES.includes(type)) throw new OkfParseError(`Invalid type for ${id}: ${type}`);
  // "> REVIEW:" lines are notes for the policy owner and never reach users.
  const body = match[2]!
    .split("\n")
    .filter((line) => !line.startsWith("> REVIEW:"))
    .join("\n")
    .trim();
  if (!body) throw new OkfParseError(`Empty body for ${id}`);

  return {
    id,
    type,
    title: fields["title"]!,
    description: fields["description"]!,
    owner: fields["owner"]!,
    tags: parseList(fields["tags"]!, "tags"),
    aliases: parseList(fields["aliases"]!, "aliases").map(normalise),
    timestamp: fields["timestamp"]!,
    body,
  };
}

export function loadOkf(sources: Record<string, string> = OKF_SOURCES): OkfDoc[] {
  const docs = Object.entries(sources).map(([file, source]) => {
    const doc = parseOkf(source);
    if (`${doc.id}.md` !== file)
      throw new OkfParseError(`id ${doc.id} does not match file ${file}`);
    return doc;
  });
  const seen = new Map<string, string>();
  for (const doc of docs) {
    for (const alias of doc.aliases) {
      const owner = seen.get(alias);
      if (owner && owner !== doc.id)
        throw new OkfParseError(`Alias "${alias}" is used by ${owner} and ${doc.id}`);
      seen.set(alias, doc.id);
    }
  }
  return docs.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Finds a document by exact id first, then by an alias contained in the query.
 * The longest matching alias wins so "cancellation fee" beats "fee".
 */
export function findOkf(docs: OkfDoc[], idOrQuery: string): OkfDoc | null {
  const key = idOrQuery.trim().toLowerCase();
  const exact = docs.find((doc) => doc.id === key);
  if (exact) return exact;

  const query = ` ${normalise(idOrQuery)} `;
  let best: { doc: OkfDoc; length: number } | null = null;
  for (const doc of docs) {
    for (const alias of [doc.id.replace(/-/g, " "), ...doc.aliases]) {
      if (alias && query.includes(` ${alias} `) && (!best || alias.length > best.length)) {
        best = { doc, length: alias.length };
      }
    }
  }
  return best?.doc ?? null;
}

/** Public clinic phone numbers and emails in approved documents; replies may repeat them. */
export function publicContacts(docs: OkfDoc[]): string[] {
  const found = docs.flatMap(
    (doc) => doc.body.match(/\+?\d[\d\s-]{8,}\d|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [],
  );
  return [...new Set(found.map((item) => item.trim()))];
}

export const okfCitation = (doc: OkfDoc) => `[OKF:${doc.id}]`;

/** One line per document for the supervisor prompt. */
export function okfCatalog(docs: OkfDoc[]): string {
  return docs.map((doc) => `- ${doc.id}: ${doc.title}. ${doc.description}`).join("\n");
}
