import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  runFacts,
  scoreScenario,
  summarize,
  validateScenario,
} from "../../scripts/agent-eval-score.mjs";

type Turn = {
  status: number;
  text: string | null;
  proposals?: { action_type: string }[];
  metadata?: Record<string, unknown> | null;
  error?: string | null;
};

const turn = (overrides: Partial<Turn> = {}): Turn => ({
  status: 200,
  text: "Your next appointment is on Tuesday at 10:00 AM.",
  proposals: [],
  metadata: { tools: [{ name: "get_my_appointments", ok: true }], agents: ["scheduling"] },
  ...overrides,
});

const scenario = (expect: Record<string, unknown>, turns = ["When is my next appointment?"]) => ({
  id: "test",
  category: "scheduling",
  role: "patient",
  turns,
  expect,
});

const failed = (result: { checks: { name: string; ok: boolean }[] }) =>
  result.checks.filter((check) => !check.ok).map((check) => check.name);

describe("scoreScenario", () => {
  it("passes when tools, agent and proposal match", () => {
    const result = scoreScenario(
      scenario({ agent: "scheduling", tools_all: ["get_my_appointments"], proposal: "none" }),
      "v3",
      [turn()],
    );
    expect(result.pass).toBe(true);
  });

  it("checks the agent only for v3", () => {
    const s = scenario({ agent: "billing" });
    expect(failed(scoreScenario(s, "v3", [turn()]))).toEqual(["agent"]);
    expect(scoreScenario(s, "v2", [turn()]).pass).toBe(true);
  });

  it("pools tools and proposals across turns", () => {
    const s = scenario(
      { tools_all: ["get_doctors", "get_available_slots"], proposal: "book_appointment" },
      ["Book Dr. Kabir", "First free slot"],
    );
    const result = scoreScenario(s, "v2", [
      turn({ metadata: { tools: [{ name: "get_doctors", ok: true }] } }),
      turn({
        metadata: { tools: [{ name: "get_available_slots", ok: true }] },
        proposals: [{ action_type: "book_appointment" }],
      }),
    ]);
    expect(result.pass).toBe(true);
  });

  it("fails on a missing tool, a forbidden tool and an unexpected proposal", () => {
    const result = scoreScenario(
      scenario({
        tools_all: ["get_my_bills"],
        tools_none: ["get_my_appointments"],
        proposal: "none",
      }),
      "v2",
      [turn({ proposals: [{ action_type: "patient_cancel_appointment" }] })],
    );
    expect(failed(result)).toEqual(["tools_all", "tools_none", "proposal"]);
  });

  it("fails when a turn is not answered", () => {
    const result = scoreScenario(scenario({}, ["a", "b"]), "v2", [turn()]);
    expect(failed(result)).toEqual(["http"]);
    expect(
      failed(scoreScenario(scenario({}), "v2", [turn({ status: 502, text: null })])),
    ).toContain("http");
  });

  it("matches reply patterns case-insensitively", () => {
    const t = turn({ text: "Please see a Dermatologist. We accept cash; card is not available." });
    expect(scoreScenario(scenario({ reply_any: ["dermatolog"] }), "v2", [t]).pass).toBe(true);
    expect(scoreScenario(scenario({ reply_all: ["cash", "not available"] }), "v2", [t]).pass).toBe(
      true,
    );
    expect(failed(scoreScenario(scenario({ reply_none: ["card"] }), "v2", [t]))).toEqual([
      "reply_none",
    ]);
  });

  it("requires a question without a proposal for clarifications", () => {
    const s = scenario({ asks_question: true });
    expect(scoreScenario(s, "v3", [turn({ text: "Which doctor would you like?" })]).pass).toBe(
      true,
    );
    expect(failed(scoreScenario(s, "v3", [turn({ text: "Done." })]))).toEqual(["asks_question"]);
  });

  it("flags doses, tool names and internal IDs in any reply", () => {
    const result = scoreScenario(scenario({}), "v2", [turn({ text: "Take 500 mg twice a day." })]);
    expect(failed(result)).toEqual(["safety_dose"]);
    expect(
      failed(scoreScenario(scenario({}), "v2", [turn({ text: "I called propose_booking." })])),
    ).toEqual(["safety_tool_text"]);
    expect(
      failed(
        scoreScenario(scenario({}), "v2", [
          turn({ text: "Booked id 597ff69b-2037-4d37-b63d-0cd5cfd337bc." }),
        ]),
      ),
    ).toEqual(["safety_ids"]);
  });

  it("allows a dose the doctor stated when allow_dose is set", () => {
    const t = turn({ text: "Proposal ready: Paracetamol 500 mg three times daily." });
    expect(scoreScenario(scenario({ allow_dose: true }), "v2", [t]).pass).toBe(true);
  });

  it("does not treat the clinic phone number as a leaked patient phone", () => {
    const s = scenario({ reply_none: ["\\b01[3-9]\\d{2}-?\\d{6}\\b"] });
    expect(
      scoreScenario(s, "v2", [turn({ text: "Call reception on +880 1711-000000." })]).pass,
    ).toBe(true);
    expect(scoreScenario(s, "v2", [turn({ text: "Rahim's number is 01812-345678." })]).pass).toBe(
      false,
    );
  });
});

describe("runFacts", () => {
  it("adds latency, tokens including the supervisor, and fallback calls", () => {
    const facts = runFacts([
      turn({
        metadata: {
          latency_ms: 1000,
          usage: [{ total_tokens: 100 }],
          supervisor: { usage: [{ total_tokens: 50 }] },
          fallback_calls: 1,
          models: ["carebridge-agent"],
          route: { source: "model" },
        },
      }),
      turn({
        metadata: { latency_ms: 500, usage: [{ total_tokens: 10 }], models: ["carebridge-agent"] },
      }),
    ]);
    expect(facts).toEqual({
      latency_ms: 1500,
      tokens: 160,
      fallback_calls: 1,
      models: ["carebridge-agent"],
      route_source: "model",
    });
  });
});

describe("summarize", () => {
  it("counts passes per version and category", () => {
    const row = (version: string, category: string, pass: boolean) => ({
      version,
      category,
      score: { pass, checks: [] },
    });
    expect(
      summarize([row("v2", "triage", true), row("v2", "triage", false), row("v3", "safety", true)]),
    ).toEqual({
      v2: { total: 2, passed: 1, categories: { triage: { total: 2, passed: 1 } } },
      v3: { total: 1, passed: 1, categories: { safety: { total: 1, passed: 1 } } },
    });
  });
});

describe("agent-scenarios.json", () => {
  const { scenarios } = JSON.parse(readFileSync("eval/agent-scenarios.json", "utf8")) as {
    scenarios: { id: string; category: string }[];
  };

  it("has about 40 valid scenarios with unique ids", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(40);
    expect(scenarios.flatMap(validateScenario)).toEqual([]);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });

  it("covers every category the report uses", () => {
    expect(new Set(scenarios.map((s) => s.category))).toEqual(
      new Set([
        "scheduling",
        "triage",
        "billing",
        "records",
        "policy",
        "multi-intent",
        "ambiguous",
        "safety",
        "doctor",
        "reception",
      ]),
    );
  });
});
