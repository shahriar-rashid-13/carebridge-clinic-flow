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
  it("loads the static placeholder with golden-set shape", () => {
    const report = loadRagasEvalReport();
    expect(report.placeholder).toBe(true);
    expect(report.assessment).toBe("A4-Option1");
    expect(report.metrics_scored).toEqual([
      "faithfulness",
      "answer_relevance",
      "context_precision",
      "context_recall",
    ]);
    expect(report.golden_set.size).toBe(38);
    expect(report.overall.faithfulness).toBeNull();
    expect(isPlaceholderReport(report)).toBe(true);
  });
});

describe("ragasOverallRows", () => {
  it("bridges A3 conceptual baselines and blanks current scores", () => {
    const rows = ragasOverallRows();
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
    expect(byLabel["Faithfulness"]?.baseline).toBe("5.00 / 5");
    expect(byLabel["Faithfulness"]?.current).toBe("—");
    expect(byLabel["Context precision"]?.baseline).toBe("P@5 0.63");
    expect(byLabel["Context recall"]?.baseline).toBe("Hit@5 1.00");
    expect(byLabel["Refusal accuracy"]?.current).toBe("—");
  });

  it("shows live scores when the harness fills the report", () => {
    const filled = {
      ...loadRagasEvalReport(),
      placeholder: false,
      status: "complete",
      overall: {
        n_scored: 33,
        faithfulness: 0.91,
        answer_relevance: 0.88,
        context_precision: 0.71,
        context_recall: 0.84,
      },
      refusal: {
        ...loadRagasEvalReport().refusal,
        correct_refuse_rate: 1,
      },
    } satisfies RagasEvalReport;

    const rows = ragasOverallRows(filled);
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
    expect(byLabel["Faithfulness"]?.current).toBe("0.91");
    expect(byLabel["Answer relevance"]?.current).toBe("0.88");
    expect(byLabel["Refusal accuracy"]?.current).toBe("1.00");
    expect(isPlaceholderReport(filled)).toBe(false);
  });
});

describe("ragasCategoryRows", () => {
  it("emits one row per metric per category with blank currents", () => {
    const rows = ragasCategoryRows();
    expect(rows.length).toBe(5 * 4);
    expect(rows.every((row) => row.current === "—" && row.baseline === "—")).toBe(true);
    expect(rows.some((row) => row.label.startsWith("multi-hop:"))).toBe(true);
  });
});

describe("eval-scores re-exports", () => {
  it("keeps the metrics page constants in sync with the placeholder", () => {
    expect(RAGAS_EVAL_ROWS).toEqual(ragasOverallRows());
    expect(RAGAS_CATEGORY_ROWS).toEqual(ragasCategoryRows());
    expect(RAGAS_PANEL_DESCRIPTION).toBe(ragasPanelDescription());
    expect(RAGAS_PANEL_DESCRIPTION).toMatch(/Placeholder JSON/);
  });
});
