// Helpers for agentic RAG tool-result metadata (`agentic.*` on search_knowledge).
// Used by tests and any future chat/debug UI; the metrics page does not require live traces.

export type AgenticHop = {
  hop?: number;
  query?: string;
  candidates?: number;
  ranking?: string;
  [key: string]: unknown;
};

export type AgenticMeta = {
  complex?: boolean;
  plan_source?: string;
  plan_reason?: string;
  queries?: string[];
  hops?: AgenticHop[];
  support_source?: string;
  support_reason?: string;
  [key: string]: unknown;
};

export type AgenticToolPayload = {
  supported?: boolean;
  refused?: boolean;
  agentic?: AgenticMeta | null;
  [key: string]: unknown;
};

export type AgenticTraceSummary = {
  present: boolean;
  complex: boolean;
  refused: boolean;
  supported: boolean | null;
  planSource: string | null;
  queryCount: number;
  hopCount: number;
  supportSource: string | null;
  label: string;
};

export function readAgenticMeta(payload: unknown): AgenticMeta | null {
  if (!payload || typeof payload !== "object") return null;
  const agentic = (payload as AgenticToolPayload).agentic;
  if (!agentic || typeof agentic !== "object") return null;
  return agentic;
}

export function summarizeAgenticTrace(payload: unknown): AgenticTraceSummary {
  const body = payload && typeof payload === "object" ? (payload as AgenticToolPayload) : null;
  const agentic = readAgenticMeta(payload);
  if (!body || !agentic) {
    return {
      present: false,
      complex: false,
      refused: false,
      supported: null,
      planSource: null,
      queryCount: 0,
      hopCount: 0,
      supportSource: null,
      label: "No agentic trace",
    };
  }

  const refused = body.refused === true || body.supported === false;
  const supported = typeof body.supported === "boolean" ? body.supported : null;
  const queryCount = Array.isArray(agentic.queries) ? agentic.queries.length : 0;
  const hopCount = Array.isArray(agentic.hops) ? agentic.hops.length : 0;
  const complex = agentic.complex === true;
  const planSource = typeof agentic.plan_source === "string" ? agentic.plan_source : null;
  const supportSource =
    typeof agentic.support_source === "string" ? agentic.support_source : null;

  const parts = [
    refused ? "refused" : supported === true ? "grounded" : "agentic",
    complex ? "multi-hop" : "single-pass",
    queryCount ? `${queryCount} quer${queryCount === 1 ? "y" : "ies"}` : null,
    hopCount ? `${hopCount} hop${hopCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return {
    present: true,
    complex,
    refused,
    supported,
    planSource,
    queryCount,
    hopCount,
    supportSource,
    label: parts.join(" · "),
  };
}
