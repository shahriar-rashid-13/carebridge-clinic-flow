import { supabase } from "@/lib/supabase/client";

export type AiVersion = "v2" | "v3";

export type VersionMetrics = {
  version: AiVersion;
  turns: number;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  avg_tokens: number | null;
  avg_model_calls: number | null;
  fallback_turns: number;
  tool_calls: number;
  tool_errors: number;
  proposal_turns: number;
  emergency_turns: number;
  injection_turns: number;
  pii_turns: number;
  output_guard_turns: number;
  keyword_route_turns: number;
  handoff_turns: number;
  clarification_turns: number;
};

export type AiMetrics = {
  days: number;
  versions: VersionMetrics[];
  v3_agents: Record<string, number>;
  v3_knowledge: Record<string, number>;
  daily: { day: string; v2: number; v3: number }[];
};

export const METRIC_PERIODS = [7, 30, 90] as const;

export async function fetchAiMetrics(days: number): Promise<AiMetrics> {
  const { data, error } = await supabase.rpc("ai_metrics", { p_days: days });
  if (error) throw new Error(error.message || "Could not load AI metrics.");
  return data as AiMetrics;
}

export function versionMetrics(metrics: AiMetrics, version: AiVersion): VersionMetrics | null {
  return metrics.versions.find((row) => row.version === version) ?? null;
}

export function formatRate(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export function formatSeconds(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("en-US");
}

export type CompareRow = {
  label: string;
  hint: string;
  v2: string;
  v3: string;
};

export function compareRows(v2: VersionMetrics | null, v3: VersionMetrics | null): CompareRow[] {
  const pick = (row: VersionMetrics | null, format: (row: VersionMetrics) => string) =>
    row ? format(row) : "—";
  const rows: { label: string; hint: string; format: (row: VersionMetrics) => string }[] = [
    {
      label: "Turns",
      hint: "Assistant replies in the period.",
      format: (r) => formatNumber(r.turns),
    },
    {
      label: "Average latency",
      hint: "Request to saved reply.",
      format: (r) => formatSeconds(r.avg_latency_ms),
    },
    { label: "Median latency", hint: "p50.", format: (r) => formatSeconds(r.p50_latency_ms) },
    { label: "Slow-tail latency", hint: "p95.", format: (r) => formatSeconds(r.p95_latency_ms) },
    {
      label: "Tokens per turn",
      hint: "Prompt plus completion, all model calls.",
      format: (r) => formatNumber(r.avg_tokens),
    },
    {
      label: "Model calls per turn",
      hint: "Includes the v3 supervisor.",
      format: (r) => (r.avg_model_calls === null ? "—" : r.avg_model_calls.toFixed(2)),
    },
    {
      label: "Fallback model used",
      hint: "Share of turns that needed the backup model.",
      format: (r) => formatRate(r.fallback_turns, r.turns),
    },
    {
      label: "Tool error rate",
      hint: "Failed tool calls out of all tool calls.",
      format: (r) =>
        r.tool_calls ? `${formatRate(r.tool_errors, r.tool_calls)} of ${r.tool_calls}` : "—",
    },
    {
      label: "Turns with a proposal",
      hint: "Booking or cancel cards shown.",
      format: (r) => formatRate(r.proposal_turns, r.turns),
    },
  ];
  return rows.map((row) => ({
    label: row.label,
    hint: row.hint,
    v2: pick(v2, row.format),
    v3: pick(v3, row.format),
  }));
}

export const AGENT_LABEL: Record<string, string> = {
  triage: "Triage",
  scheduling: "Scheduling",
  billing: "Billing",
  records: "Records",
};

export const KNOWLEDGE_LABEL: Record<string, string> = {
  okf: "Clinic policy (OKF)",
  rag: "FAQ search (RAG)",
  none: "No knowledge",
};

export function toChartRows(
  counts: Record<string, number>,
  labels: Record<string, string>,
): { name: string; count: number }[] {
  return Object.entries(counts)
    .map(([key, count]) => ({ name: labels[key] ?? key, count }))
    .sort((a, b) => b.count - a.count);
}
