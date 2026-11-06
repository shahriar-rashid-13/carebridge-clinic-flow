import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRagasEval } from "@/hooks/use-ragas-eval";
import { loadRagasEvalReport } from "@/lib/clinic/ragas-eval";

describe("useRagasEval", () => {
  it("exposes live overall and category rows for the metrics panel", () => {
    const { result } = renderHook(() => useRagasEval());
    expect(result.current.placeholder).toBe(false);
    expect(result.current.overallRows.length).toBeGreaterThanOrEqual(4);
    expect(result.current.categoryRows.length).toBe(20);
    expect(result.current.description).toMatch(/38 items/);
    expect(result.current.description).toMatch(/Scored 38 items/);
    expect(result.current.report.a3_baseline_lock).toBe("A3b");
    expect(result.current.report.run_id).toBe("a4-live-2026-11-06");
    expect(
      result.current.overallRows.find((row) => row.label === "Faithfulness")?.current,
    ).toBe("1.00");
  });

  it("accepts an injected placeholder report for harness-swap testing", () => {
    const source = {
      ...loadRagasEvalReport(),
      placeholder: true,
      status: "placeholder",
      run_at: null,
      overall: {
        n_scored: null,
        faithfulness: null,
        answer_relevance: null,
        context_precision: null,
        context_recall: null,
      },
    };
    const { result } = renderHook(() => useRagasEval(source));
    expect(result.current.placeholder).toBe(true);
    expect(result.current.overallRows.find((row) => row.label === "Faithfulness")?.current).toBe(
      "—",
    );
    expect(result.current.description).toMatch(/Placeholder JSON/);
  });
});
