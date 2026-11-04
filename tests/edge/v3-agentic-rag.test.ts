// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REFUSE_MESSAGE,
  agenticSearch,
  heuristicPlan,
  looksComplex,
  mergeCandidates,
  parseFollowUps,
  parsePlan,
  parseSupport,
  planPrompt,
  supportPrompt,
} from "../../supabase/functions/carebridge-ai-v3/agentic-rag.ts";
import type { Candidate } from "../../supabase/functions/carebridge-ai-v3/retrieve.ts";
import { denoEnv } from "../helpers/deno";
import { edgeClinic } from "../helpers/edge";

const fetchMock = vi.fn<typeof fetch>();

const candidate = (n: number, text = `Answer ${n}`): Candidate => ({
  doc_id: `FAQ-${String(n).padStart(6, "0")}`,
  record_type: "faq",
  specialization: null,
  diagnosis: null,
  text,
  similarity: 0.9 - n * 0.01,
});

const rowsFor = (ids: number[], prefix: string) =>
  ids.map((id) => ({
    doc_id: `FAQ-${String(id).padStart(6, "0")}`,
    record_type: "faq",
    content: `${prefix} ${id}`,
    similarity: 0.9,
  }));

const llmReply = (content: string) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ model: "gemini", choices: [{ message: { content } }] }), {
      status: 200,
    }),
  );

beforeEach(() => {
  denoEnv["LITELLM_BASE_URL"] = "https://litellm.test";
  denoEnv["LITELLM_API_KEY"] = "sk-test";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("Supabase", {
    ai: {
      Session: class {
        run = vi.fn().mockResolvedValue(Array.from({ length: 384 }, () => 0.05));
      },
    },
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("looksComplex / heuristicPlan", () => {
  it("treats short single-topic questions as simple", () => {
    expect(looksComplex("how do I pay")).toBe(false);
    expect(heuristicPlan("how do I pay")).toMatchObject({
      complex: false,
      queries: ["how do I pay"],
      source: "heuristic",
    });
  });

  it("flags multi-part clinic questions", () => {
    expect(looksComplex("What is the cardiology fee and how do I pay?")).toBe(true);
    expect(looksComplex("Compare cancellation versus refund rules")).toBe(true);
    expect(looksComplex("Hours? Waitlist expiry?")).toBe(true);
  });
});

describe("parsePlan / parseFollowUps / parseSupport", () => {
  it("reads planner JSON and caps queries", () => {
    expect(
      parsePlan(
        '{"complex": true, "queries": ["fee", "pay", "extra"], "reason": "two facts"}',
        "fee and pay",
      ),
    ).toMatchObject({
      complex: true,
      queries: ["fee", "pay"],
      source: "model",
    });
    expect(parsePlan("not json", "q")).toBeNull();
  });

  it("reads follow-ups and support judgments", () => {
    expect(parseFollowUps('{"queries": ["waitlist expiry"], "reason": "gap"}')).toEqual([
      "waitlist expiry",
    ]);
    expect(parseFollowUps('{"queries": []}')).toEqual([]);
    expect(parseSupport('{"supported": false, "reason": "off topic"}')).toEqual({
      supported: false,
      reason: "off topic",
      source: "model",
    });
    expect(parseSupport('{"supported": "yes"}')).toBeNull();
  });
});

describe("mergeCandidates", () => {
  it("dedupes by doc_id and keeps the highest similarity", () => {
    const merged = mergeCandidates([
      [candidate(1), candidate(2)],
      [{ ...candidate(1), similarity: 0.99, text: "better" }, candidate(3)],
    ]);
    expect(merged.map((row) => row.doc_id)).toEqual(["FAQ-000001", "FAQ-000002", "FAQ-000003"]);
    expect(merged[0]?.text).toBe("better");
  });
});

describe("prompts", () => {
  it("ask for JSON-only plan and support decisions", () => {
    expect(planPrompt("fees and payment")).toContain("Reply with only JSON");
    expect(supportPrompt("fees", [candidate(1)])).toContain("supported=true only");
  });
});

describe("agenticSearch", () => {
  it("refuses when retrieved passages do not support the question", async () => {
    const clinic = edgeClinic();
    clinic.rpcResult("match_rag_documents", { data: rowsFor([1, 2], "Parking rules") });
    llmReply('{"ranking": [1, 2]}');
    llmReply('{"supported": false, "reason": "passages discuss parking, not lab hours"}');

    const result = await agenticSearch(
      "what time does the lab open",
      { recordType: null, specialization: null },
      clinic.ctx("patient"),
    );

    expect(result).toMatchObject({
      ok: true,
      supported: false,
      refused: true,
      results: [],
      message: REFUSE_MESSAGE,
    });
    expect(result.agentic.support_source).toBe("model");
    expect(result.agentic.hops).toHaveLength(1);
  });

  it("plans sub-queries and runs a second hop for complex questions", async () => {
    const clinic = edgeClinic();
    const question = "What is the cardiology fee and how do I join the waitlist?";
    // One passage so re-rank is skipped; rpcResult is static for every hop.
    clinic.rpcResult("match_rag_documents", {
      data: [
        {
          doc_id: "FAQ-000010",
          record_type: "faq",
          content: "Cardiology fee is 80. Patients can join the waitlist from booking.",
          similarity: 0.91,
        },
      ],
    });
    llmReply(
      '{"complex": true, "queries": ["cardiology consultation fee", "join waitlist"], "reason": "fee and waitlist"}',
    );
    llmReply('{"queries": ["waitlist how to join"], "reason": "confirm waitlist steps"}');
    llmReply('{"supported": true, "reason": "fee and waitlist covered"}');

    const result = await agenticSearch(
      question,
      { recordType: null, specialization: null },
      clinic.ctx("patient"),
    );

    const rpcCalls = clinic.rpcCalls("match_rag_documents");
    expect(rpcCalls).toHaveLength(3);
    expect(rpcCalls.map((call) => call.args.query_text)).toEqual([
      "cardiology consultation fee",
      "join waitlist",
      "waitlist how to join",
    ]);
    expect(result).toMatchObject({
      supported: true,
      refused: false,
    });
    expect(result.agentic.complex).toBe(true);
    expect(result.agentic.queries).toEqual([
      "cardiology consultation fee",
      "join waitlist",
    ]);
    expect(result.agentic.hops.map((hop) => hop.hop)).toEqual([1, 1, 2]);
    expect(result.results.map((row) => row.citation)).toEqual(["[FAQ-000010]"]);
  });

  it("refuses on empty retrieval without a support-model call", async () => {
    const clinic = edgeClinic();
    clinic.rpcResult("match_rag_documents", { data: [] });

    const result = await agenticSearch(
      "teleportation policy",
      { recordType: null, specialization: null },
      clinic.ctx("patient"),
    );

    expect(result.refused).toBe(true);
    expect(result.agentic.support_source).toBe("empty");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when the support judge fails rather than guessing", async () => {
    const clinic = edgeClinic();
    clinic.rpcResult("match_rag_documents", {
      data: [
        {
          doc_id: "FAQ-000001",
          record_type: "faq",
          content: "Only one passage.",
          similarity: 0.9,
        },
      ],
    });
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }));

    const result = await agenticSearch(
      "opening hours",
      { recordType: null, specialization: null },
      clinic.ctx("patient"),
    );

    expect(result).toMatchObject({
      refused: true,
      supported: false,
      results: [],
    });
    expect(result.agentic.support_source).toBe("fallback");
  });
});
