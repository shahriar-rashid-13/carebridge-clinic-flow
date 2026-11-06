# Assessment 4 Report — CareBridge

**SJ Innovation · Intern assignment · Shahriar Rashid**  
**Date:** 6 November 2026 (Asia/Dhaka)  
**Chosen option:** **Option 1** — Trustworthy assistant + evaluation dashboard (agentic RAG + RAGAS)  
**Not pursued:** Option 2, Option 3 (bonus second option not claimed)

---

## What to submit (Dev Control Tower checklist)

| # | Requirement | This submission |
|---|---|---|
| 1 | Live URL + GitHub with `assessment-4` tag + which option | Below |
| 2 | Short demo (video or live) showing the feature in the app | [Demo video (Google Drive)](https://drive.google.com/file/d/1--JeKRM0KYSB9IX59GB7qTY2AMQ4go6B/view?usp=sharing) |
| 3 | Evaluation numbers + short write-up (concept / trade-offs / limits) | Sections 2–4 |
| 4 | Updated test credentials | Section 6 |

### Links

| Item | URL |
|---|---|
| Live app | https://carebridge-clinic-flow.vercel.app |
| Clinic repo | https://github.com/shahriar-rashid-13/carebridge-clinic-flow |
| RAG / eval repo | https://github.com/shahriar-rashid-13/carebridge-rag |
| LiteLLM gateway | https://github.com/shahriar-rashid-13/carebridge-liteLLM |
| Tag (clinic-flow) | https://github.com/shahriar-rashid-13/carebridge-clinic-flow/releases/tag/assessment-4 |
| Tag (rag) | https://github.com/shahriar-rashid-13/carebridge-rag/releases/tag/assessment-4 |
| Demo video | https://drive.google.com/file/d/1--JeKRM0KYSB9IX59GB7qTY2AMQ4go6B/view?usp=sharing |
| Option 1 detail write-up | [OPTION_1_WRITEUP.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-4/OPTION_1_WRITEUP.md) |
| Langfuse notes | [LANGFUSE.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-4/LANGFUSE.md) |
| Demo accounts | [DEMO_ACCOUNTS.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/DEMO_ACCOUNTS.md) |
| Final project report (A1–A4) | [FINAL_PROJECT_REPORT.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/FINAL_PROJECT_REPORT.md) |

---

## 1. Feature (end-to-end in the app)

Assessment 4 deepens the production assistant **`carebridge-ai-v3`** with **agentic RAG** on `search_knowledge`:

1. **Plan** — optional sub-queries for complex questions (capped).
2. **Multi-hop retrieve** — hybrid search (gte-small + fusion + 20→5 rerank) for up to two hops.
3. **Support judge / refuse** — if passages do not support an answer, the tool returns refuse / unsupported; the assistant must not invent clinic facts.
4. **Evidence in UI** — receptionist **`/metrics`** shows a **RAGAS quality (Assessment 4)** panel with live scores.
5. **Optional tracing** — Langfuse OTEL ingest from Edge (`langfuse.ts`) to Japan cloud `https://jp.cloud.langfuse.com` when `LANGFUSE_*` secrets are set.

This runs inside the deployed clinic app (Vercel UI + Supabase Edge), not only as a notebook. Free stack: Gemini via CareBridge LiteLLM gateway, open-source gte-small embeddings, synthetic seed corpus.

**In-app demo path (also in the video)**

1. Patient / receptionist `/ai`: out-of-corpus question → clear refuse.
2. Multi-facet clinic question (e.g. fee + waitlist) → cited answer from OKF/RAG when supported.
3. Receptionist `/metrics` → RAGAS panel with filled numbers from run `a4-live-2026-11-06`.

---

## 2. AI concept / technique

| Piece | Technique |
|---|---|
| Agentic retrieval | Plan → retrieve → (optional second hop) → support check → answer or refuse |
| Grounding | Answers only from tool results (OKF policies and/or RAG passages) with citations |
| Evaluation | RAGAS-aligned **0–1** scores via `carebridge-judge` on a 38-item golden set |
| Regression gate | Hard CI job `ragas-gate` on `carebridge-rag` with calibrated floors |
| Observability | Optional Langfuse OTEL spans named `agentic_search_knowledge` |

Assessment 3 already shipped hybrid retrieval and a **1–5** matching judge. A4 does **not** treat A3 faithfulness/relevance **5.00/5.00** as RAGAS **1.0** — different scale. A3b Hit@5 / MRR / P@5 bridge conceptually to context recall / ranking / precision; A4 re-scores agentic answers with RAGAS metrics.

---

## 3. Evaluation and evidence

**Run id:** `a4-live-2026-11-06`  
**Harness:** `carebridge-rag/scripts/ragas-eval-live.mjs`  
**Golden set:** `carebridge-rag/eval/ragas-golden-set.json` (**n = 38**)  
**Flag:** `real_ragas=true`

| Metric | Score |
|---|---:|
| Faithfulness | **1.00** |
| Answer relevance | **0.96** |
| Context precision | **0.84** |
| Context recall | **0.99** |
| Refusal accuracy | **1.00** (5/5 correct refuses; 0 false answers) |

**CI hard floors** (`eval/ragas-thresholds.json`, calibrated from this run):  
faithfulness ≥ 0.85 · answer_relevance ≥ 0.80 · context_precision ≥ 0.65 · context_recall ≥ 0.75  

Full category breakdown: [OPTION_1_WRITEUP.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-4/OPTION_1_WRITEUP.md) · [RAGAS_EVAL_REPORT.md](https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/eval/RAGAS_EVAL_REPORT.md).

---

## 4. Short write-up — concept, trade-offs, limits

**Concept.** CareBridge already had a multi-agent clinic assistant and hybrid RAG. Assessment 4 Option 1 makes the knowledge path **trustworthy under uncertainty**: the system plans retrieval, may hop, then **refuses** when evidence is missing, and proves that behaviour with **RAGAS** numbers on a fixed golden set shown on `/metrics` and enforced in CI.

**Trade-offs.** Extra planner and support-judge calls add latency and free-tier flake risk. Fail-closed refuse protects faithfulness but can lower multi-hop answer relevance when coverage is thin. RAGAS 0–1 scores must not be equated with the older A3 1–5 judge. Langfuse helps debugging but needs Edge secrets and the JP host (not US cloud).

**Limits.** Synthetic corpus only (no real PHI). Judge scores are LLM-approximate. Planning is capped (max two sub-queries / two hops). Metrics RAGAS panel is receptionist-only. Free Gemini/gateway quotas can 429; the live harness retries. Bonus (fine-tune / second option) was not claimed.

---

## 5. Rubric map (how this submission hits the score sheet)

| Parameter | Max | Where we show it |
|---|---:|---|
| Feature works end-to-end in the app | 25 | Live `/ai` refuse + multi-hop; `/metrics` RAGAS panel; demo video |
| Correct use of the AI concept | 20 | Agentic plan / multi-hop / refuse; citations; Langfuse OTEL optional |
| Evaluation and evidence with numbers | 20 | Table above; golden set; CI floors; Metrics UI |
| Free tools only, reliable enough | 10 | Gemini free via LiteLLM; gte-small; no paid API claim |
| UI/UX — feature surfaced to the user | 10 | Confirm cards unchanged; RAGAS block on `/metrics`; chat refuse UX |
| Tests, docs, DCT submission | 10 | `ragas-gate` CI; Vitest Metrics expectations; this report + tags |
| Short write-up | 5 | Section 4 |
| **Total** | **100** | |
| Bonus (fine-tune / second option) | +10 | **Not claimed** |

**Golden rule:** one measured Option 1 feature inside the existing CareBridge seed stack, completed within the Assessment 4 window.

---

## 6. Updated test credentials

Primary demo triad (login page chips fill email; password shared for synthetic demo only):

| Role | Name | Email | Password |
|---|---|---|---|
| Patient | Sarah Jenkins | `sarah@example.com` | `123456` |
| Doctor | Dr. Marcus Vance | `marcus@example.com` | `123456` |
| Receptionist | Clara Morgan | `clara@example.com` | `123456` |

Catalog seed doctors (bookable staff, optional login): `doc-001@example.com` … `doc-036@example.com`  
(e.g. Dr. Farhana Kabir = `doc-001@example.com`). Password = 12345678 in local `carebridge-rag/.env` (not the triad password unless you set it that way).  
See [DEMO_ACCOUNTS.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/DEMO_ACCOUNTS.md).

---

## 7. Tests and ops notes

- **carebridge-rag CI:** hard `ragas-gate` job with Actions secrets for the live judge path.
- **clinic-flow:** Metrics unit tests expect filled live RAGAS JSON (not placeholder zeros).
- **Edge:** agentic RAG + Langfuse require `npx supabase functions deploy carebridge-ai-v3` (Vercel-only deploy does not ship Edge changes).
- **Langfuse:** `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL=https://jp.cloud.langfuse.com`; ingest via `POST /api/public/otel/v1/traces` (legacy `/ingestion` deprecated).

