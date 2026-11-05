import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRagasEval } from "@/hooks/use-ragas-eval";
import { loadRagasEvalReport } from "@/lib/clinic/ragas-eval";

describe("useRagasEval", () => {
  it("exposes placeholder overall and category rows for the metrics panel", () => {
    const { result } = renderHook(() => useRagasEval());
    expect(result.current.placeholder).toBe(true);
    expect(result.current.overallRows.length).toBeGreaterThanOrEqual(4);
    expect(result.current.categoryRows.length).toBe(20);
    expect(result.current.description).toMatch(/38 items/);
    expect(result.current.report.a3_baseline_lock).toBe("A3b");
  });

  it("accepts an injected report (future harness swap)", () => {
    const source = {
      ...loadRagasEvalReport(),
      placeholder: false,
      status: "complete",
      run_at: "2026-11-06T00:00:00.000Z",
      overall: {
        n_scored: 33,
        faithfulness: 0.9,
        answer_relevance: 0.85,
        context_precision: 0.7,
        context_recall: 0.8,
      },
    };
    const { result } = renderHook(() => useRagasEval(source));
    expect(result.current.placeholder).toBe(false);
    expect(result.current.overallRows.find((row) => row.label === "Faithfulness")?.current).toBe(
      "0.90",
    );
    expect(result.current.description).toMatch(/2026-11-06/);
  });
});
