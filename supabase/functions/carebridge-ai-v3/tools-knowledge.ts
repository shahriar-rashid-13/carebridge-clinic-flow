import { embedGte } from "../carebridge-ai-v2/embed-gte.ts";
import { callGateway, embedText, MODEL_ALIAS } from "../carebridge-ai-v2/gateway.ts";
import { enumArg, textArg, type ToolDefinition } from "../carebridge-ai-v2/shared.ts";
import { anonymise, SPECIALIZATIONS } from "../carebridge-ai-v2/tools-knowledge.ts";

const RECORD_TYPES = ["faq", "visit_note", "prescription"] as const;

const SOURCE_LABEL: Record<string, string> = {
  faq: "Clinic FAQ",
  visit_note: "Anonymised past visit note (another patient)",
  prescription: "Anonymised past prescription (another patient)",
};

export const CANDIDATE_COUNT = 20;
export const RESULT_COUNT = 5;
export const RERANK_TIMEOUT_MS = 6_000;
const RERANK_SNIPPET_CHARS = 500;
// Same cutoff as v2; see carebridge-ai-v2/tools-knowledge.ts.
const MIN_SIMILARITY_GTE = 0.82;
const EMBED_TIMEOUT_MS = 8_000;

export type Candidate = {
  doc_id: string;
  record_type: string;
  specialization: string | null;
  diagnosis: string | null;
  text: string;
  similarity: number | null;
};

type MatchRow = {
  doc_id: string;
  record_type: string;
  content: string | null;
  specialization: string | null;
  diagnosis: string | null;
  similarity: number | null;
};

export type RerankOutcome = {
  results: Candidate[];
  mode: "reranked" | "fused";
  error?: string;
};

export function rerankPrompt(query: string, candidates: Candidate[]): string {
  const list = candidates
    .map(
      (candidate, index) =>
        `[${index + 1}] ${candidate.text.slice(0, RERANK_SNIPPET_CHARS).replace(/\s+/g, " ")}`,
    )
    .join("\n");
  return [
    "Rank the passages by how well they answer the question. Ignore passages that do not help.",
    `Question: ${query}`,
    "Passages:",
    list,
    `Reply with only JSON like {"ranking": [3, 1, 7]}: the numbers of the ${RESULT_COUNT} most useful passages, best first.`,
  ].join("\n");
}

/** Reads the model's ranking; returns candidate indexes, or null when the reply is unusable. */
export function parseRanking(raw: string | null, count: number): number[] | null {
  const match = raw?.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const ranking = (parsed as { ranking?: unknown })?.ranking;
  if (!Array.isArray(ranking)) return null;
  const indexes: number[] = [];
  for (const value of ranking) {
    const number = typeof value === "string" ? Number(value) : value;
    if (!Number.isInteger(number) || number < 1 || number > count) continue;
    if (!indexes.includes(number - 1)) indexes.push(number - 1);
  }
  return indexes.length ? indexes : null;
}

/** Re-orders search candidates with the model; keeps the fused search order if that fails. */
export async function rerank(query: string, candidates: Candidate[]): Promise<RerankOutcome> {
  const fused = { results: candidates.slice(0, RESULT_COUNT), mode: "fused" as const };
  if (candidates.length <= 1) return fused;

  const result = await callGateway({
    model: MODEL_ALIAS,
    messages: [{ role: "user", content: rerankPrompt(query, candidates) }],
    timeoutMs: RERANK_TIMEOUT_MS,
  });
  if (!result.ok) return { ...fused, error: result.detail };
  const ranking = parseRanking(result.content, candidates.length);
  if (!ranking) return { ...fused, error: "invalid ranking" };

  const picked = ranking.slice(0, RESULT_COUNT).map((index) => candidates[index]!);
  return { results: picked, mode: "reranked" };
}

export const searchKnowledge: ToolDefinition = {
  name: "search_knowledge",
  description:
    "Search the CareBridge knowledge base: clinic FAQ and anonymised past visit notes and prescriptions from other patients. Use it for general questions about conditions, and for clinic questions that get_policy does not answer. Each result has a citation id to quote. It never contains the signed-in user's own records.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The question in plain words, at most 300 characters.",
      },
      record_type: {
        type: "string",
        enum: [...RECORD_TYPES],
        description:
          "Optional. faq for clinic questions; visit_note or prescription for condition questions.",
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

    let embedding: "gte" | "gemini" | "keyword_only" = "keyword_only";
    let queryEmbeddingGte: string | null = null;
    let queryEmbedding: string | null = null;
    const gte = await embedGte(query);
    if (gte.ok) {
      embedding = "gte";
      queryEmbeddingGte = `[${gte.embedding.join(",")}]`;
    } else {
      const embedded = await embedText(query, EMBED_TIMEOUT_MS);
      if (embedded.ok) {
        embedding = "gemini";
        queryEmbedding = `[${embedded.embedding.join(",")}]`;
      }
    }

    const { data, error } = await ctx.db.rpc("match_rag_documents", {
      query_text: query,
      query_embedding: queryEmbedding,
      query_embedding_gte: queryEmbeddingGte,
      min_similarity_gte: MIN_SIMILARITY_GTE,
      match_count: CANDIDATE_COUNT,
      filter_record_type: recordType,
      filter_specialization: specialization,
    });
    if (error) throw new Error(`match_rag_documents failed: ${error.message}`);

    const candidates: Candidate[] = ((data ?? []) as MatchRow[]).map((row) => ({
      doc_id: String(row.doc_id),
      record_type: String(row.record_type),
      specialization: row.specialization ?? null,
      diagnosis: row.diagnosis ?? null,
      text: anonymise(String(row.content ?? "")),
      similarity:
        typeof row.similarity === "number" ? Math.round(row.similarity * 100) / 100 : null,
    }));
    if (!candidates.length) {
      return {
        ok: true,
        mode: embedding,
        results: [],
        message:
          "No matching clinic knowledge was found. Tell the user you do not know and suggest asking the clinic or a doctor.",
      };
    }

    const ranked = await rerank(query, candidates);
    if (ranked.error)
      console.warn(JSON.stringify({ tool: "search_knowledge", rerank_fallback: ranked.error }));
    return {
      ok: true,
      mode: embedding,
      ranking: ranked.mode,
      candidates: candidates.length,
      results: ranked.results.map((row) => ({
        citation: `[${row.doc_id}]`,
        source: SOURCE_LABEL[row.record_type] ?? "Clinic knowledge",
        specialization: row.specialization,
        diagnosis: row.diagnosis,
        text: row.text,
        relevance: row.similarity,
      })),
      message:
        "Answer only from these results and cite each fact with its citation, for example [FAQ-000021].",
    };
  },
};
