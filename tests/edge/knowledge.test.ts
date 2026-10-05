// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { embedText } from "../../supabase/functions/carebridge-ai-v2/gateway.ts";
import {
  anonymise,
  searchKnowledge,
} from "../../supabase/functions/carebridge-ai-v2/tools-knowledge.ts";
import { toolsForRole } from "../../supabase/functions/carebridge-ai-v2/tools.ts";
import { denoEnv } from "../helpers/deno";
import { edgeClinic } from "../helpers/edge";

const fetchMock = vi.fn<typeof fetch>();
const vector = Array.from({ length: 768 }, () => 0.01);

const embeddingResponse = (embedding: number[] = vector) =>
  new Response(JSON.stringify({ data: [{ index: 0, embedding }] }), { status: 200 });

const VISIT_NOTE =
  "Visit note | 2025-01-02 02:00 PM | Dr. Tanvir Ahmed, General Medicine | Patient: Sabbir Patwary, 54, male. Mr. Patwary says he has had no appetite. Sabbir works in sales. Assessment: Typhoid fever.";

beforeEach(() => {
  denoEnv["LITELLM_BASE_URL"] = "https://litellm.test/";
  denoEnv["LITELLM_API_KEY"] = "sk-test";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("anonymise", () => {
  it("removes patient and doctor names from the header and body", () => {
    const text = anonymise(VISIT_NOTE);
    expect(text).not.toMatch(/Sabbir|Patwary|Tanvir|Ahmed/);
    expect(text).toContain("the doctor, General Medicine");
    expect(text).toContain("Patient: anonymised, 54, male");
    expect(text).toContain("the patient says he has had no appetite");
    expect(text).toContain("Assessment: Typhoid fever.");
  });

  it("leaves FAQ text and words like 'Dry eye' unchanged", () => {
    const faq = "Q: What helps Dry eye? A: Use the drops. Mrs or Dr without a name stay.";
    expect(anonymise(faq)).toBe(faq);
  });
});

describe("embedText", () => {
  it("posts the query to the embed alias", async () => {
    fetchMock.mockResolvedValue(embeddingResponse());
    await expect(embedText("waitlist", 1000)).resolves.toEqual({ ok: true, embedding: vector });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://litellm.test/embeddings");
    expect(JSON.parse(String(init?.body))).toEqual({ model: "carebridge-embed", input: "waitlist" });
  });

  it("rejects a vector with the wrong dimension", async () => {
    fetchMock.mockResolvedValue(embeddingResponse([0.1, 0.2]));
    await expect(embedText("x", 1000)).resolves.toMatchObject({ ok: false });
  });

  it("reports a quota error instead of throwing", async () => {
    fetchMock.mockResolvedValue(new Response("quota exceeded", { status: 429 }));
    await expect(embedText("x", 1000)).resolves.toEqual({
      ok: false,
      detail: "embeddings 429: quota exceeded",
    });
  });
});

describe("search_knowledge", () => {
  it("is available to every role", () => {
    for (const role of ["patient", "doctor", "receptionist"] as const) {
      expect(toolsForRole(role).map((tool) => tool.name)).toContain("search_knowledge");
    }
  });

  it("searches with the gte-small query embedding when the runtime model works", async () => {
    const clinic = edgeClinic();
    const run = vi.fn().mockResolvedValue(Array.from({ length: 384 }, () => 0.05));
    vi.stubGlobal("Supabase", {
      ai: {
        Session: class {
          run = run;
        },
      },
    });
    clinic.rpcResult("match_rag_documents", {
      data: [{ record_type: "faq", content: "Q: Cancel? A: Open My Appointments.", similarity: 0.93 }],
    });

    const result = await searchKnowledge.run({ query: "how do I cancel" }, clinic.ctx("patient"));

    expect(run).toHaveBeenCalledWith("how do I cancel", { mean_pool: true, normalize: true });
    const [call] = clinic.rpcCalls("match_rag_documents");
    expect(String(call?.args["query_embedding_gte"])).toMatch(/^\[0\.05,/);
    expect(call?.args["query_embedding"]).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, mode: "gte", results: [{ source: "Clinic FAQ", relevance: 0.93 }] });
  });

  it("falls back to the Gemini embedding when gte-small fails", async () => {
    const clinic = edgeClinic();
    fetchMock.mockResolvedValue(embeddingResponse());
    clinic.rpcResult("match_rag_documents", {
      data: [
        {
          doc_id: "VN-000001",
          record_type: "visit_note",
          content: VISIT_NOTE,
          specialization: "General Medicine",
          diagnosis: "Typhoid fever",
          similarity: 0.8123,
        },
      ],
    });

    const result = await searchKnowledge.run(
      { query: "fever after drinking unsafe water", record_type: "visit_note" },
      clinic.ctx("patient"),
    );

    const [call] = clinic.rpcCalls("match_rag_documents");
    expect(call?.args).toMatchObject({
      query_text: "fever after drinking unsafe water",
      match_count: 5,
      filter_record_type: "visit_note",
      filter_specialization: null,
    });
    expect(String(call?.args["query_embedding"])).toMatch(/^\[0\.01,/);
    expect(call?.args["query_embedding_gte"]).toBeNull();
    expect(result).toMatchObject({
      ok: true,
      mode: "gemini",
      results: [
        {
          source: "Anonymised past visit note (another patient)",
          specialization: "General Medicine",
          diagnosis: "Typhoid fever",
          relevance: 0.81,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/Sabbir|Patwary|Tanvir|Ahmed|VN-000001/);
  });

  it("falls back to keyword search when both embeddings fail", async () => {
    const clinic = edgeClinic();
    fetchMock.mockResolvedValue(new Response("quota exceeded", { status: 429 }));
    clinic.rpcResult("match_rag_documents", {
      data: [{ record_type: "faq", content: "Q: Waitlist? A: 120 minutes.", similarity: null }],
    });

    const result = await searchKnowledge.run({ query: "waitlist offer" }, clinic.ctx("patient"));

    expect(clinic.rpcCalls("match_rag_documents")[0]?.args["query_embedding"]).toBeNull();
    expect(result).toMatchObject({
      ok: true,
      mode: "keyword_only",
      results: [{ source: "Clinic FAQ", text: "Q: Waitlist? A: 120 minutes.", relevance: null }],
    });
  });

  it("tells the model to say it does not know when nothing matches", async () => {
    const clinic = edgeClinic();
    fetchMock.mockResolvedValue(embeddingResponse());
    clinic.rpcResult("match_rag_documents", { data: [] });

    const result = await searchKnowledge.run({ query: "parking fees" }, clinic.ctx("patient"));

    expect(result).toMatchObject({ ok: true, results: [] });
    expect(String(result["message"])).toContain("you do not know");
  });

  it("rejects an unknown specialization before searching", async () => {
    const clinic = edgeClinic();
    await expect(
      searchKnowledge.run({ query: "rash", specialization: "Astrology" }, clinic.ctx("patient")),
    ).rejects.toThrow("specialization must be one of");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the database search fails", async () => {
    const clinic = edgeClinic();
    fetchMock.mockResolvedValue(embeddingResponse());
    clinic.rpcResult("match_rag_documents", { data: null, error: { message: "boom" } });
    await expect(searchKnowledge.run({ query: "x" }, clinic.ctx("patient"))).rejects.toThrow(
      "match_rag_documents failed: boom",
    );
  });
});
