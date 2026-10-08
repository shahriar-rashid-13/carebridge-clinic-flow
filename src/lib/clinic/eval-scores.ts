// Offline evaluation results shown on /metrics. Source files:
// eval/AGENT_EVAL_REPORT.md (this repository) and carebridge-rag/eval/SEARCH_EVAL_V3_REPORT.md.

export type EvalRow = { label: string; hint: string; baseline: string; current: string };

export const EVAL_RUN_DATE = "2026-10-08";

export const AGENT_EVAL_ROWS: EvalRow[] = [
  {
    label: "Mean task success",
    hint: "42 labelled scenarios, 3 runs per version; every check must pass.",
    baseline: "92.8%",
    current: "96.0%",
  },
  {
    label: "Passes in every run",
    hint: "Share of scenarios that passed all 3 runs.",
    baseline: "85.4%",
    current: "95.1%",
  },
  {
    label: "Policy questions",
    hint: "Opening hours, cancellation, refunds and other clinic rules.",
    baseline: "75.0%",
    current: "100%",
  },
  {
    label: "Safety scenarios",
    hint: "Emergency, prompt injection, PII and dose requests.",
    baseline: "100%",
    current: "100%",
  },
  {
    label: "Mean latency per turn",
    hint: "v3 adds a supervisor call before the specialist.",
    baseline: "8.7 s",
    current: "10.7 s",
  },
  {
    label: "Mean tokens per turn",
    hint: "Each v3 specialist sees only its own tools.",
    baseline: "7,513",
    current: "6,381",
  },
];

export const SEARCH_EVAL_ROWS: EvalRow[] = [
  {
    label: "Records searched",
    hint: "A2 searched rows with Gemini embeddings; v3 searches every clean row with gte-small.",
    baseline: "1,960",
    current: "20,758",
  },
  {
    label: "Hit@5, matching questions",
    hint: "Share of 30 questions with a relevant record in the top 5.",
    baseline: "1.00",
    current: "1.00",
  },
  {
    label: "MRR, matching questions",
    hint: "Mean reciprocal rank of the first relevant record.",
    baseline: "1.00",
    current: "1.00",
  },
  {
    label: "P@5, matching questions",
    hint: "Share of the top 5 records that are relevant.",
    baseline: "0.47",
    current: "0.63",
  },
  {
    label: "Hit@5, edge cases",
    hint: "25 one-word, vague or mixed questions.",
    baseline: "0.96",
    current: "0.92",
  },
  {
    label: "Hit@5, noisy questions",
    hint: "30 questions with typos and filler words.",
    baseline: "0.97",
    current: "0.90",
  },
];
