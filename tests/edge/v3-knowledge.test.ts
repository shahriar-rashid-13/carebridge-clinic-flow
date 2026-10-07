// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseRanking,
  rerank,
  rerankPrompt,
  searchKnowledge,
  stripDoses,
  type Candidate,
} from "../../supabase/functions/carebridge-ai-v3/tools-knowledge.ts";
import { denoEnv } from "../helpers/deno";
import { edgeClinic } from "../helpers/edge";

const fetchMock = vi.fn<typeof fetch>();

const candidate = (n: number): Candidate => ({
  doc_id: `FAQ-${String(n).padStart(6, "0")}`,
  record_type: "faq",
  specialization: null,
  diagnosis: null,
  text: `Answer number ${n}.`,
  similarity: 0.9,
});

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    doc_id: `FAQ-${String(i + 1).padStart(6, "0")}`,
    record_type: "faq",
    content: `Q: Question ${i + 1}? A: Answer ${i + 1}.`,
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

describe("parseRanking", () => {
  it("reads 1-based numbers, drops duplicates and out-of-range values", () => {
    expect(parseRanking('```json\n{"ranking": [3, "1", 3, 99, 0, 2.5]}\n```', 5)).toEqual([2, 0]);
  });

  it("returns null for unusable replies", () => {
    expect(parseRanking(null, 5)).toBeNull();
    expect(parseRanking("passage 3 is best", 5)).toBeNull();
    expect(parseRanking('{"ranking": "3"}', 5)).toBeNull();
    expect(parseRanking('{"ranking": [9]}', 5)).toBeNull();
  });
});

describe("rerank", () => {
  const candidates = Array.from({ length: 8 }, (_, i) => candidate(i + 1));

  it("keeps the model's top five in its order", async () => {
    llmReply('{"ranking": [8, 2, 5, 1, 3, 4]}');
    const outcome = await rerank("question", candidates);
    expect(outcome.mode).toBe("reranked");
    expect(outcome.results.map((row) => row.doc_id)).toEqual([
      "FAQ-000008",
      "FAQ-000002",
      "FAQ-000005",
      "FAQ-000001",
      "FAQ-000003",
    ]);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.model).toBe("carebridge-agent");
    expect(body.tools).toBeUndefined();
  });

  it("falls back to the fused order on invalid output or gateway failure", async () => {
    llmReply("I like passage two");
    await expect(rerank("q", candidates)).resolves.toMatchObject({
      mode: "fused",
      error: "invalid ranking",
    });
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }));
    const failed = await rerank("q", candidates);
    expect(failed.mode).toBe("fused");
    expect(failed.results.map((row) => row.doc_id)).toEqual(
      candidates.slice(0, 5).map((row) => row.doc_id),
    );
  });

  it("skips the model for a single candidate", async () => {
    await expect(rerank("q", [candidate(1)])).resolves.toMatchObject({ mode: "fused" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("numbers and trims passages in the prompt", () => {
    const prompt = rerankPrompt("how do I pay", [{ ...candidate(1), text: "x".repeat(900) }]);
    expect(prompt).toContain("Question: how do I pay");
    expect(prompt).toContain(`[1] ${"x".repeat(500)}\n`);
    expect(prompt).not.toContain("x".repeat(501));
  });
});

describe("search_knowledge v3", () => {
  it("fetches 20 candidates, re-ranks them, and returns five cited results", async () => {
    const clinic = edgeClinic();
    clinic.rpcResult("match_rag_documents", { data: rows(20) });
    llmReply('{"ranking": [20, 1, 2, 3, 4]}');

    const result = await searchKnowledge.run({ query: "how do I pay" }, clinic.ctx("patient"));

    expect(clinic.rpcCalls("match_rag_documents")[0]?.args).toMatchObject({ match_count: 20 });
    expect(result).toMatchObject({ ok: true, mode: "gte", ranking: "reranked", candidates: 20 });
    const results = result["results"] as { citation: string; text: string }[];
    expect(results).toHaveLength(5);
    expect(results[0]).toMatchObject({
      citation: "[FAQ-000020]",
      text: "Q: Question 20? A: Answer 20.",
    });
  });

  it("returns the fused top five when re-ranking times out", async () => {
    const clinic = edgeClinic();
    clinic.rpcResult("match_rag_documents", { data: rows(7) });
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));

    const result = await searchKnowledge.run({ query: "fees" }, clinic.ctx("patient"));

    expect(result).toMatchObject({ ranking: "fused" });
    expect((result["results"] as { citation: string }[]).map((row) => row.citation)).toEqual([
      "[FAQ-000001]",
      "[FAQ-000002]",
      "[FAQ-000003]",
      "[FAQ-000004]",
      "[FAQ-000005]",
    ]);
  });

  it("says it does not know when nothing matches, without calling the model", async () => {
    const clinic = edgeClinic();
    clinic.rpcResult("match_rag_documents", { data: [] });
    const result = await searchKnowledge.run({ query: "parking on Mars" }, clinic.ctx("patient"));
    expect(result).toMatchObject({ ok: true, results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes medicine amounts from other patients' prescriptions", async () => {
    const clinic = edgeClinic();
    clinic.rpcResult("match_rag_documents", {
      data: [
        {
          doc_id: "RX-000001",
          record_type: "prescription",
          content:
            "Paracetamol 500 mg every 6 hours; Dextromethorphan syrup 10 ml three times daily.",
          similarity: 0.9,
        },
      ],
    });
    llmReply('{"ranking": [1]}');

    const result = await searchKnowledge.run({ query: "fever" }, clinic.ctx("doctor"));

    expect((result["results"] as { text: string }[])[0]?.text).toBe(
      "Paracetamol [dose omitted] every 6 hours; Dextromethorphan syrup [dose omitted] three times daily.",
    );
  });
});

describe("stripDoses", () => {
  it("keeps FAQ text and strips amounts from visit notes", () => {
    expect(stripDoses("Take 2 tablets.", "faq")).toBe("Take 2 tablets.");
    expect(stripDoses("Salbutamol 2 puffs, 1.5 mg nightly.", "visit_note")).toBe(
      "Salbutamol [dose omitted], [dose omitted] nightly.",
    );
  });
});
