import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compareRows,
  fetchAiMetrics,
  formatRate,
  formatSeconds,
  toChartRows,
  versionMetrics,
  type AiMetrics,
  type VersionMetrics,
} from "@/lib/clinic/metrics";

const { fake } = await vi.hoisted(async () => import("../helpers/supabase"));

vi.mock("@/lib/supabase/client", () => ({ supabase: fake.client }));

beforeEach(() => {
  fake.reset();
});

const row = (overrides: Partial<VersionMetrics>): VersionMetrics => ({
  version: "v2",
  turns: 10,
  avg_latency_ms: 24000,
  p50_latency_ms: 20000,
  p95_latency_ms: 46000,
  avg_tokens: 6360,
  avg_model_calls: 2.5,
  fallback_turns: 3,
  tool_calls: 8,
  tool_errors: 2,
  proposal_turns: 4,
  emergency_turns: 0,
  injection_turns: 0,
  pii_turns: 0,
  output_guard_turns: 0,
  keyword_route_turns: 0,
  handoff_turns: 0,
  clarification_turns: 0,
  ...overrides,
});

describe("fetchAiMetrics", () => {
  it("calls the ai_metrics RPC with the period", async () => {
    await fetchAiMetrics(7);
    expect(fake.rpcs).toEqual([{ name: "ai_metrics", args: { p_days: 7 } }]);
  });

  it("throws the database error message", async () => {
    fake.onRpc(() => ({ error: { message: "Only receptionists can view AI metrics." } }));
    await expect(fetchAiMetrics(30)).rejects.toThrow("Only receptionists can view AI metrics.");
  });
});

describe("formatting", () => {
  it("formats rates and handles an empty denominator", () => {
    expect(formatRate(3, 10)).toBe("30%");
    expect(formatRate(1, 0)).toBe("—");
  });

  it("formats milliseconds as seconds", () => {
    expect(formatSeconds(17026)).toBe("17.0 s");
    expect(formatSeconds(null)).toBe("—");
  });
});

describe("compareRows", () => {
  it("puts v2 and v3 side by side", () => {
    const rows = compareRows(
      row({}),
      row({ version: "v3", avg_latency_ms: 17026, fallback_turns: 0 }),
    );
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel["Average latency"]).toMatchObject({ v2: "24.0 s", v3: "17.0 s" });
    expect(byLabel["Fallback model used"]).toMatchObject({ v2: "30%", v3: "0%" });
    expect(byLabel["Tool error rate"]).toMatchObject({ v2: "25% of 8" });
    expect(byLabel["Tokens per turn"]).toMatchObject({ v2: "6,360" });
  });

  it("shows a dash when a version has no turns", () => {
    const rows = compareRows(row({}), null);
    expect(rows.every((r) => r.v3 === "—")).toBe(true);
  });

  it("shows a dash for tool errors when no tools ran", () => {
    const rows = compareRows(row({ tool_calls: 0, tool_errors: 0 }), null);
    expect(rows.find((r) => r.label === "Tool error rate")?.v2).toBe("—");
  });
});

describe("versionMetrics and toChartRows", () => {
  it("finds a version row", () => {
    const metrics: AiMetrics = {
      days: 30,
      versions: [row({}), row({ version: "v3", turns: 5 })],
      v3_agents: {},
      v3_knowledge: {},
      daily: [],
    };
    expect(versionMetrics(metrics, "v3")?.turns).toBe(5);
    expect(versionMetrics({ ...metrics, versions: [] }, "v2")).toBeNull();
  });

  it("labels and sorts counts, keeping unknown keys", () => {
    expect(
      toChartRows(
        { none: 2, okf: 3, other: 1 },
        { okf: "Clinic policy (OKF)", none: "No knowledge" },
      ),
    ).toEqual([
      { name: "Clinic policy (OKF)", count: 3 },
      { name: "No knowledge", count: 2 },
      { name: "other", count: 1 },
    ]);
  });
});
