import { describe, expect, it } from "vitest";
import { readAgenticMeta, summarizeAgenticTrace } from "@/lib/clinic/agentic-meta";

const groundedPayload = {
  ok: true,
  supported: true,
  refused: false,
  results: [{ citation: "FAQ-000009" }],
  agentic: {
    complex: true,
    plan_source: "llm",
    plan_reason: "two facets",
    queries: ["cardiology fee", "waitlist"],
    hops: [
      { hop: 1, query: "cardiology fee", candidates: 5, ranking: "reranked" },
      { hop: 1, query: "waitlist", candidates: 4, ranking: "reranked" },
      { hop: 2, query: "follow-up", candidates: 3, ranking: "fused" },
    ],
    support_source: "llm",
    support_reason: "both fees and waitlist present",
  },
};

const refusedPayload = {
  ok: true,
  supported: false,
  refused: true,
  results: [],
  message: "I do not know",
  agentic: {
    complex: false,
    plan_source: "heuristic",
    plan_reason: "simple",
    queries: ["teleportation policy"],
    hops: [{ hop: 1, query: "teleportation policy", candidates: 0, ranking: "none" }],
    support_source: "empty",
    support_reason: "no hits",
  },
};

describe("readAgenticMeta", () => {
  it("returns null when agentic metadata is missing", () => {
    expect(readAgenticMeta(null)).toBeNull();
    expect(readAgenticMeta({ ok: true })).toBeNull();
  });

  it("reads the agentic block from a tool payload", () => {
    expect(readAgenticMeta(groundedPayload)?.plan_source).toBe("llm");
    expect(readAgenticMeta(groundedPayload)?.queries).toHaveLength(2);
  });
});

describe("summarizeAgenticTrace", () => {
  it("labels a multi-hop grounded search", () => {
    const summary = summarizeAgenticTrace(groundedPayload);
    expect(summary.present).toBe(true);
    expect(summary.refused).toBe(false);
    expect(summary.complex).toBe(true);
    expect(summary.queryCount).toBe(2);
    expect(summary.hopCount).toBe(3);
    expect(summary.label).toBe("grounded · multi-hop · 2 queries · 3 hops");
  });

  it("labels a refuse-when-unsupported result", () => {
    const summary = summarizeAgenticTrace(refusedPayload);
    expect(summary.refused).toBe(true);
    expect(summary.supported).toBe(false);
    expect(summary.supportSource).toBe("empty");
    expect(summary.label).toMatch(/^refused/);
  });

  it("handles a missing payload", () => {
    expect(summarizeAgenticTrace(undefined).label).toBe("No agentic trace");
    expect(summarizeAgenticTrace({}).present).toBe(false);
  });
});
