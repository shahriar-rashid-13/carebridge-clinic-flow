import { enumArg, textArg, type ToolDefinition } from "../carebridge-ai-v2/shared.ts";
import { SPECIALIZATIONS } from "../carebridge-ai-v2/tools-knowledge.ts";
import { agenticSearch } from "./agentic-rag.ts";
import {
  CANDIDATE_COUNT,
  DOSE_OMITTED,
  RESULT_COUNT,
  hybridRetrieve,
  parseRanking,
  rerank,
  rerankPrompt,
  stripDoses,
  type Candidate,
  type HybridRetrieveOutcome,
  type RerankOutcome,
} from "./retrieve.ts";

const RECORD_TYPES = ["faq", "visit_note", "prescription"] as const;

export {
  CANDIDATE_COUNT,
  DOSE_OMITTED,
  RESULT_COUNT,
  hybridRetrieve,
  parseRanking,
  rerank,
  rerankPrompt,
  stripDoses,
};
export type { Candidate, HybridRetrieveOutcome, RerankOutcome };

export const searchKnowledge: ToolDefinition = {
  name: "search_knowledge",
  description:
    "Search the CareBridge knowledge base with agentic retrieval: plans sub-queries for complex questions, multi-hop hybrid search over clinic FAQ and anonymised past visit notes/prescriptions, then refuses when the passages do not support an answer. Use it for general questions about conditions, and for clinic questions that get_policy does not answer. Each result has a citation id to quote. It never contains the signed-in user's own records. If supported is false, tell the user you do not know — do not invent facts.",
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
    return agenticSearch(query, { recordType, specialization }, ctx);
  },
};
