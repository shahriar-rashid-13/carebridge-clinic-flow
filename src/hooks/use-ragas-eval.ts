import * as React from "react";
import {
  isPlaceholderReport,
  loadRagasEvalReport,
  ragasCategoryRows,
  ragasOverallRows,
  ragasPanelDescription,
  type RagasEvalReport,
} from "@/lib/clinic/ragas-eval";
import type { EvalRow } from "@/lib/clinic/eval-scores";

export type RagasEvalView = {
  report: RagasEvalReport;
  placeholder: boolean;
  overallRows: EvalRow[];
  categoryRows: EvalRow[];
  description: string;
};

/** Static RAGAS report for /metrics. Swap the JSON (or pass `source`) when the harness lands. */
export function useRagasEval(source?: RagasEvalReport): RagasEvalView {
  return React.useMemo(() => {
    const report = loadRagasEvalReport(source);
    return {
      report,
      placeholder: isPlaceholderReport(report),
      overallRows: ragasOverallRows(report),
      categoryRows: ragasCategoryRows(report),
      description: ragasPanelDescription(report),
    };
  }, [source]);
}
