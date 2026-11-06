# Assessment 4 — Option 1 write-up

### SJ Innovation | Shahriar Rashid | 2026-11-06 (Asia/Dhaka)

**Option:** Trustworthy assistant + evaluation dashboard (RAGAS + agentic RAG)  
**Repos:** [carebridge-clinic-flow](https://github.com/shahriar-rashid-13/carebridge-clinic-flow) · [carebridge-rag](https://github.com/shahriar-rashid-13/carebridge-rag)  
**Live app:** https://carebridge-clinic-flow.vercel.app  
**Status:** Complete for Option 1 — live RAGAS filled, Edge agentic RAG deployed, Metrics UI wired.

---

## 1. Concept

Assessment 3 shipped hybrid RAG (gte-small + re-rank) and a 1–5 LiteLLM judge. Option 1 deepens **trust**: plan → multi-hop retrieve → **refuse when unsupported**, prove quality with **RAGAS-aligned 0–1** metrics on a 38-item golden set, surface scores on receptionist `/metrics`, and gate regressions in CI.

| Piece | Where |
|---|---|
| Agentic retrieval | `carebridge-ai-v3` (`agentic-rag.ts`, `retrieve.ts`) — deployed 2026-11-06 |
| Golden set (38) | `carebridge-rag/eval/ragas-golden-set.json` |
| Live harness | `carebridge-rag/scripts/ragas-eval-live.mjs` |
| Metrics UI | `/metrics` ← `src/lib/clinic/ragas-eval-placeholder.json` |
| CI gate | `ragas-gate.mjs` + calibrated `eval/ragas-thresholds.json` |
| Langfuse | Optional Edge ingest (`langfuse.ts`); secrets pending free-cloud keys |

---

## 2. Evaluation numbers

Scale: RAGAS-aligned **0–1** via `carebridge-judge`. A3 judge was **1–5** — **do not equate 5.00 with 1.0**.

**Run:** `a4-live-2026-11-06` · `2026-11-06T06:32:54.727Z` · `n_scored=38` · `real_ragas=true`

### Overall

| Metric | A3 bridge (conceptual) | A4 RAGAS (agentic) | Notes |
|---|---|---|---|
| Faithfulness | 5.00 / 5 (matching judge) | **1.00** | Different scale; A4 is 0–1 |
| Answer relevance | 5.00 / 5 (matching judge) | **0.96** | |
| Context precision | P@5 0.63 (matching) | **0.84** overall · **0.74** matching | Bridge only |
| Context recall | Hit@5 1.00 (matching) | **0.99** overall · **1.00** matching | Bridge only |
| Refusal accuracy | A3b OOS empty retrieve | **1.00** (5/5) · false answer **0** | |

### By golden category

| Category | n | Faithfulness | Answer rel. | Ctx precision | Ctx recall |
|---|---:|---:|---:|---:|---:|
| matching | 10 | 1.00 | 1.00 | 0.74 | 1.00 |
| edge | 6 | 1.00 | 1.00 | 1.00 | 1.00 |
| noisy | 6 | 1.00 | 1.00 | 0.80 | 1.00 |
| policy | 6 | 1.00 | 1.00 | 0.96 | 0.92 |
| multi_hop | 5 | 1.00 | 0.68 | — | — |
| refusal | 5 | correct refuse **5/5** · false answer **0** | | | |

Multi-hop answer relevance is lower because fail-closed support refused some two-part questions when retrieve coverage was thin; faithfulness stayed 1.0 (no invented fees/waitlist facts).

**CI hard floors (calibrated):** faithfulness ≥ **0.85** · answer_relevance ≥ **0.80** · context_precision ≥ **0.65** · context_recall ≥ **0.75**

---

## 3. Trade-offs

1. **Latency vs trust.** Plan + support judge add calls on top of hybrid retrieve + re-rank.
2. **A3 matching ceiling.** Headroom lives in harder categories and context precision/recall, not re-quoting 5.00.
3. **Scale bridge, not identity.** Hit@5 / P@5 ≈ recall / precision only conceptually.
4. **Fail-closed refuse.** Safer under quota; can lower multi-hop answer relevance when the judge is unsure.
5. **Langfuse optional.** Tracing is wired; free-cloud keys were not in office `.env` at run time — set Supabase secrets to activate.

---

## 4. Limits

- Synthetic corpus only — no real PHI.
- Judge scores are LLM-approximate and free-tier flake-sensitive (429s observed; retries succeeded).
- Agentic planning capped (max 2 sub-queries, 2 hops).
- Metrics panel is receptionist `/metrics` only.
- Langfuse remains inactive until `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` are set on the Edge project.

---

## 5. Demo checklist

1. Receptionist `/metrics` → **RAGAS quality (Assessment 4)** shows filled scores.
2. Chat (v3): out-of-corpus → refuse; multi-facet (fee + waitlist) → cited answer.
3. Tag `assessment-4` on clinic-flow + rag after merge; attach this write-up + credentials to Dev Control Tower.

### Smoke evidence (2026-11-06 office)

- **Refuse:** flying-car parking / drone ambulance rates → “I do not know… no information available…”
- **Multi-hop:** Cardiology fee + waitlist → answered both facets with `[OKF:consultation-fees]` and `[OKF:waitlist]`

### Demo credentials

| Role | Email |
|---|---|
| Patient | `sarah@example.com` |
| Doctor | `marcus@example.com` |
| Receptionist | `clara@example.com` |

Passwords: same as Assessment 2/3 DCT submission (not repeated in git).
