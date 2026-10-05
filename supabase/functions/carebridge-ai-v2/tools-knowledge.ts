import { embedGte } from "./embed-gte.ts";
import { embedText } from "./gateway.ts";
import { enumArg, textArg, type ToolDefinition } from "./shared.ts";

const RECORD_TYPES = ["faq", "visit_note", "prescription"] as const;

export const SPECIALIZATIONS = [
  "Cardiology",
  "Dermatology",
  "Endocrinology",
  "ENT",
  "Gastroenterology",
  "General Medicine",
  "Neurology",
  "Obstetrics and Gynecology",
  "Ophthalmology",
  "Orthopedics",
  "Psychiatry",
  "Pulmonology",
] as const;

const SOURCE_LABEL: Record<string, string> = {
  faq: "Clinic FAQ",
  visit_note: "Anonymised past visit note (another patient)",
  prescription: "Anonymised past prescription (another patient)",
};

const MATCH_COUNT = 5;
const EMBED_TIMEOUT_MS = 8_000;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Removes the fictional patient and doctor names from corpus text. Records follow the header format
 * "Dr. <name>, <specialization> | Patient: <name>, <age>, <sex>" and may repeat the patient's
 * name in the body ("Mr. Patwary").
 */
export function anonymise(content: string): string {
  const patientName = content.match(/Patient: ([^,|]+),/)?.[1]?.trim() ?? "";
  let text = content
    .replace(/Patient: [^,|]+,/g, "Patient: anonymised,")
    .replace(/\bDr\.?\s+[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2}/g, "the doctor")
    .replace(/\b(?:Mr|Mrs|Ms|Miss)\.?\s+[A-Z][\w'-]*/g, "the patient");
  for (const part of patientName.split(/\s+/).filter((word) => word.length > 1)) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, "g"), "the patient");
  }
  return text;
}

export const searchKnowledge: ToolDefinition = {
  name: "search_knowledge",
  description:
    "Search the CareBridge knowledge base: clinic FAQ (accounts, booking, waitlist, billing, policies) and anonymised past visit notes and prescriptions from other patients. Use it for clinic policy questions and general questions about conditions. It never contains the signed-in user's own records.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The question in plain words, at most 300 characters." },
      record_type: {
        type: "string",
        enum: [...RECORD_TYPES],
        description: "Optional. faq for clinic policies; visit_note or prescription for condition questions.",
      },
      specialization: {
        type: "string",
        enum: [...SPECIALIZATIONS],
        description: "Optional. Limit results to one specialization.",
      },
    },
    required: ["query"],
  },
  roles: ["patient", "doctor", "receptionist"],
  async run(args, ctx) {
    const query = textArg(args, "query", 300);
    const recordType = enumArg(args, "record_type", RECORD_TYPES);
    const specialization = enumArg(args, "specialization", SPECIALIZATIONS);

    // gte-small covers every row; the Gemini embedding only covers the original 2,260 rows.
    let mode: "gte" | "gemini" | "keyword_only" = "keyword_only";
    let queryEmbeddingGte: string | null = null;
    let queryEmbedding: string | null = null;
    const gte = await embedGte(query);
    if (gte.ok) {
      mode = "gte";
      queryEmbeddingGte = `[${gte.embedding.join(",")}]`;
    } else {
      console.warn(JSON.stringify({ tool: "search_knowledge", gte_fallback: gte.detail }));
      const embedded = await embedText(query, EMBED_TIMEOUT_MS);
      if (embedded.ok) {
        mode = "gemini";
        queryEmbedding = `[${embedded.embedding.join(",")}]`;
      } else {
        console.warn(JSON.stringify({ tool: "search_knowledge", embed_fallback: embedded.detail }));
      }
    }

    const { data, error } = await ctx.db.rpc("match_rag_documents", {
      query_text: query,
      query_embedding: queryEmbedding,
      query_embedding_gte: queryEmbeddingGte,
      match_count: MATCH_COUNT,
      filter_record_type: recordType,
      filter_specialization: specialization,
    });
    if (error) throw new Error(`match_rag_documents failed: ${error.message}`);

    const results = (data ?? []).map((row: any) => ({
      source: SOURCE_LABEL[row.record_type] ?? "Clinic knowledge",
      specialization: row.specialization ?? null,
      diagnosis: row.diagnosis ?? null,
      text: anonymise(String(row.content ?? "")),
      relevance: typeof row.similarity === "number" ? Math.round(row.similarity * 100) / 100 : null,
    }));

    if (!results.length) {
      return {
        ok: true,
        mode,
        results: [],
        message:
          "No matching clinic knowledge was found. Tell the user you do not know and suggest asking the clinic or a doctor.",
      };
    }
    return { ok: true, mode, results };
  },
};
