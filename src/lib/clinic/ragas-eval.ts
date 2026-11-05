// RAGAS / answer-quality eval shown on /metrics.
// Source: src/lib/clinic/ragas-eval-placeholder.json (mirrors eval/ragas-eval-results.placeholder.json).
// Live harness output from carebridge-rag should replace nulls with 0–1 scores.

import type { EvalRow } from "@/lib/clinic/eval-scores";
import placeholder from "@/lib/clinic/ragas-eval-placeholder.json";

export type RagasMetricName =
  | "faithfulness"
  | "answer_relevance"
  | "context_precision"
  | "context_recall";

export type RagasCategoryScores = {
  n: number;
  faithfulness: number | null;
  answer_relevance: number | null;
  context_precision: number | null;
  context_recall: number | null;
};

export type RagasEvalReport = {
  schema_version: number;
  assessment: string;
  status: string;
  placeholder: boolean;
  run_id: string | null;
  run_at: string | null;
  system_under_test: string;
  a3_baseline_lock: string;
  a3_baseline_note: string;
  golden_set: {
    path: string;
    schema_version: number;
    size: number;
    counts_by_category: Record<string, number>;
  };
  metrics_scored: RagasMetricName[];
  overall: {
    n_scored: number | null;
    faithfulness: number | null;
    answer_relevance: number | null;
    context_precision: number | null;
    context_recall: number | null;
  };
  by_category: Record<string, RagasCategoryScores>;
  refusal: {
    n: number;
    correct_refuse_rate: number | null;
    false_answer_rate: number | null;
    note: string;
  };
  a3_conceptual_bridge: {
    matching_hit_at_5: number;
    matching_mrr: number;
    matching_p_at_5: number;
    edge_hit_at_5: number;
    noisy_hit_at_5: number;
    judge_faithfulness_1_to_5: number;
    judge_relevance_1_to_5: number;
    note: string;
  };
  ci_gate: { wired: boolean; thresholds: unknown; note: string };
  langfuse: { wired: boolean; note: string };
  fill_tomorrow: string[];
};

const METRIC_HINT: Record<RagasMetricName, string> = {
  faithfulness: "Answer claims supported by retrieved context (RAGAS, 0–1).",
  answer_relevance: "How well the answer addresses the question (RAGAS, 0–1).",
  context_precision: "Share of retrieved context that is relevant (RAGAS, 0–1).",
  context_recall: "Share of needed gold context that was retrieved (RAGAS, 0–1).",
};

/** Format a 0–1 score for the metrics tables; null → em dash (awaiting harness). */
export function formatRagasScore(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export function isPlaceholderReport(report: RagasEvalReport): boolean {
  return report.placeholder === true || report.status === "placeholder";
}

export function loadRagasEvalReport(
  source: RagasEvalReport = placeholder as RagasEvalReport,
): RagasEvalReport {
  return source;
}

/** Overall RAGAS rows: A3 bridge (conceptual) vs current harness (blank until live run). */
export function ragasOverallRows(report: RagasEvalReport = loadRagasEvalReport()): EvalRow[] {
  const bridge = report.a3_conceptual_bridge;
  const overall = report.overall;
  return [
    {
      label: "Faithfulness",
      hint: `${METRIC_HINT.faithfulness} A3 judge was ${bridge.judge_faithfulness_1_to_5.toFixed(2)} / 5 on matching — different scale.`,
      baseline: `${bridge.judge_faithfulness_1_to_5.toFixed(2)} / 5`,
      current: formatRagasScore(overall.faithfulness),
    },
    {
      label: "Answer relevance",
      hint: `${METRIC_HINT.answer_relevance} A3 judge was ${bridge.judge_relevance_1_to_5.toFixed(2)} / 5 on matching — different scale.`,
      baseline: `${bridge.judge_relevance_1_to_5.toFixed(2)} / 5`,
      current: formatRagasScore(overall.answer_relevance),
    },
    {
      label: "Context precision",
      hint: `${METRIC_HINT.context_precision} Bridged from A3 matching P@5 (${bridge.matching_p_at_5.toFixed(2)}), not numerically equal.`,
      baseline: `P@5 ${bridge.matching_p_at_5.toFixed(2)}`,
      current: formatRagasScore(overall.context_precision),
    },
    {
      label: "Context recall",
      hint: `${METRIC_HINT.context_recall} Bridged from A3 matching Hit@5 (${bridge.matching_hit_at_5.toFixed(2)}), not numerically equal.`,
      baseline: `Hit@5 ${bridge.matching_hit_at_5.toFixed(2)}`,
      current: formatRagasScore(overall.context_recall),
    },
    {
      label: "Refusal accuracy",
      hint: report.refusal.note,
      baseline: "5 / 5 empty (A3b out-of-scope)",
      current: formatRagasScore(report.refusal.correct_refuse_rate),
    },
  ];
}

const CATEGORY_ORDER = ["matching", "edge", "noisy", "policy", "multi_hop"] as const;

/** Per-category means for the secondary RAGAS table. */
export function ragasCategoryRows(report: RagasEvalReport = loadRagasEvalReport()): EvalRow[] {
  return CATEGORY_ORDER.flatMap((category) => {
    const scores = report.by_category[category];
    if (!scores) return [];
    const labelBase = category.replace("_", "-");
    return (report.metrics_scored as RagasMetricName[]).map((metric) => ({
      label: `${labelBase}: ${metric.replace("_", " ")}`,
      hint: `n=${scores.n}. ${METRIC_HINT[metric]}`,
      baseline: "—",
      current: formatRagasScore(scores[metric]),
    }));
  });
}

export function ragasPanelDescription(report: RagasEvalReport = loadRagasEvalReport()): string {
  const gold = report.golden_set;
  const run = report.run_at ? `Run ${report.run_at}` : "Live RAGAS run pending";
  const status = isPlaceholderReport(report)
    ? "Placeholder JSON — scores fill after the harness run."
    : `Scored ${report.overall.n_scored ?? "—"} items.`;
  return `${run}. Golden set ${gold.size} items (${report.a3_baseline_lock} lock). ${status}`;
}
