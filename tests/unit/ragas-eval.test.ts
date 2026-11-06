import { describe, expect, it } from "vitest";
import {
  formatRagasScore,
  isPlaceholderReport,
  loadRagasEvalReport,
  ragasCategoryRows,
  ragasOverallRows,
  ragasPanelDescription,
  type RagasEvalReport,
} from "@/lib/clinic/ragas-eval";
import {
  RAGAS_CATEGORY_ROWS,
  RAGAS_EVAL_ROWS,
  RAGAS_PANEL_DESCRIPTION,
} from "@/lib/clinic/eval-scores";

describe("formatRagasScore", () => {
  it("formats 0–1 scores and blanks nulls", () => {
    expect(formatRagasScore(0.876)).toBe("0.88");
    expect(formatRagasScore(1, 3)).toBe("1.000");
    expect(formatRagasScore(null)).toBe("—");
    expect(formatRagasScore(undefined)).toBe("—");
  });
});

describe("loadRagasEvalReport", () => {
  it("loads the live A4 harness report with golden-set shape", () => {
    const report = loadRagasEvalReport();
    expect(report.placeholder).toBe(false);
    expect(report.status).toBe("live");
    expect(report.assessment).toBe("A4-Option1");
    expect(report.run_id).toBe("a4-live-2026-11-06");
    expect(report.metrics_scored).toEqual([
      "faithfulness",
      "answer_relevance",
      "context_precision",
      "context_recall",
    ]);
    expect(report.golden_set.size).toBe(38);
    expect(report.overall.n_scored).toBe(38);
    expect(report.overall.faithfulness).toBe(1);
    expect(report.overall.answer_relevance).toBeCloseTo(0.9579, 4);
    expect(report.overall.context_precision).toBeCloseTo(0.8376, 4);
    expect(report.overall.context_recall).toBeCloseTo(0.9853, 4);
    expect(report.refusal.correct_refuse_rate).toBe(1);
    expect(isPlaceholderReport(report)).toBe(false);
  });
});

describe("ragasOverallRows", () => {
  it("bridges A3 conceptual baselines and shows live current scores", () => {
    const rows = ragasOverallRows();
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
    expect(byLabel["Faithfulness"]?.baseline).toBe("5.00 / 5");
    expect(byLabel["Faithfulness"]?.current).toBe("1.00");
    expect(byLabel["Answer relevance"]?.current).toBe("0.96");
    expect(byLabel["Context precision"]?.baseline).toBe("P@5 0.63");
    expect(byLabel["Context precision"]?.current).toBe("0.84");
    expect(byLabel["Context recall"]?.baseline).toBe("Hit@5 1.00");
    expect(byLabel["Context recall"]?.current).toBe("0.99");
    expect(byLabel["Refusal accuracy"]?.current).toBe("1.00");
  });

  it("shows blank currents when an injected report is still a placeholder", () => {
    const blank = {
      ...loadRagasEvalReport(),
      placeholder: true,
      status: "placeholder",
      overall: {
        n_scored: null,
        faithfulness: null,
        answer_relevance: null,
        context_precision: null,
        context_recall: null,
      },
      refusal: {
        ...loadRagasEvalReport().refusal,
        correct_refuse_rate: null,
        false_answer_rate: null,
      },
    } satisfies RagasEvalReport;

    const rows = ragasOverallRows(blank);
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
    expect(byLabel["Faithfulness"]?.current).toBe("—");
    expect(byLabel["Refusal accuracy"]?.current).toBe("—");
    expect(isPlaceholderReport(blank)).toBe(true);
  });
});

describe("ragasCategoryRows", () => {
  it("emits one row per metric per category with live currents where scored", () => {
    const rows = ragasCategoryRows();
    expect(rows.length).toBe(5 * 4);
    expect(rows.some((row) => row.label.startsWith("multi-hop:"))).toBe(true);

    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
    expect(byLabel["matching: faithfulness"]?.current).toBe("1.00");
    expect(byLabel["edge: context precision"]?.current).toBe("1.00");
    expect(byLabel["multi-hop: answer relevance"]?.current).toBe("0.68");
    // Multi-hop context metrics were null on the live refuse-heavy subset.
    expect(byLabel["multi-hop: context precision"]?.current).toBe("—");
    expect(byLabel["multi-hop: context recall"]?.current).toBe("—");
  });
});

describe("eval-scores re-exports", () => {
  it("keeps the metrics page constants in sync with the live report", () => {
    expect(RAGAS_EVAL_ROWS).toEqual(ragasOverallRows());
    expect(RAGAS_CATEGORY_ROWS).toEqual(ragasCategoryRows());
    expect(RAGAS_PANEL_DESCRIPTION).toBe(ragasPanelDescription());
    expect(RAGAS_PANEL_DESCRIPTION).toMatch(/Scored 38 items/);
    expect(RAGAS_PANEL_DESCRIPTION).toMatch(/a4-live-2026-11-06|2026-11-06/);
  });
});
