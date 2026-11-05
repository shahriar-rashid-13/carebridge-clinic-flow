# Assessment 4 — Option 1 write-up (draft)

### SJ Innovation | Shahriar Rashid | draft 2026-11-05 (metrics fill 2026-11-06)

**Option:** Trustworthy assistant + evaluation dashboard (RAGAS + agentic RAG)  
**Repos:** [carebridge-clinic-flow](https://github.com/shahriar-rashid-13/carebridge-clinic-flow) (UI + agentic Edge path) · [carebridge-rag](https://github.com/shahriar-rashid-13/carebridge-rag) (golden set / harness)  
**Status:** Draft — concept, trade-offs, and limits locked; **RAGAS numbers blank until tomorrow’s harness run**.

---

## 1. Concept

Assessment 3 already shipped hybrid RAG (gte-small + re-rank) and a custom LiteLLM answer judge. Option 1 deepens **trust**: the assistant should retrieve more carefully on hard questions, **refuse when the corpus does not support an answer**, and prove quality with **RAGAS** (faithfulness, answer relevance, context precision, context recall) on a golden set — not only Hit@5 / a 1–5 judge.

| Piece | What it does | Where |
|---|---|---|
| Agentic retrieval | Plan sub-queries → multi-hop hybrid retrieve → groundedness / refuse | `carebridge-ai-v3` (`agentic-rag.ts`) — PR stack base |
| Golden eval set | 38 synthetic items (matching / edge / noisy / policy / refusal / multi-hop) | `carebridge-rag/eval/ragas-golden-set.json` |
| RAGAS harness | Score live answers + contexts 0–1; fill UI JSON | carebridge-rag Step 4 (tomorrow) |
| Eval quality UI | Reception `/metrics` panel reads static / harness-shaped JSON | `eval/ragas-eval-results.placeholder.json` → `/metrics` |
| CI gate | Fail deploy when scores regress | Thresholds TBD after first live run |
| Langfuse | Trace plan / hops / refuse | **Out of scope today** (deferred) |

Success for Option 1: agentic behaviour works in the live app, RAGAS report shows improvement vs the locked **A3b** baseline (see project `docs/a3-rag-baseline.md`), and the metrics surface is not notebook-only.

---

## 2. Evaluation numbers (blanks for tomorrow)

Scale: RAGAS **0–1**. A3 judge was **1–5** on matching only — **do not equate 5.00 with 1.0**.

### Overall (fill after harness)

| Metric | A3 bridge (conceptual) | A4 RAGAS (agentic) | Δ |
|---|---|---|---|
| Faithfulness | 5.00 / 5 (matching judge) | ___ | ___ |
| Answer relevance | 5.00 / 5 (matching judge) | ___ | ___ |
| Context precision | P@5 0.63 (matching) | ___ | ___ |
| Context recall | Hit@5 1.00 (matching) | ___ | ___ |
| Refusal accuracy | 5 / 5 empty (A3b OOS) | ___ | ___ |

### By golden category (n in set)

| Category | n | Faithfulness | Answer rel. | Ctx precision | Ctx recall |
|---|---:|---|---|---|---|
| matching | 10 | ___ | ___ | ___ | ___ |
| edge | 6 | ___ | ___ | ___ | ___ |
| noisy | 6 | ___ | ___ | ___ | ___ |
| policy | 6 | ___ | ___ | ___ | ___ |
| multi_hop | 5 | ___ | ___ | ___ | ___ |
| refusal | 5 | correct refuse ___ · false answer ___ | | | |

**Run metadata (tomorrow):** `run_id` ___ · `run_at` ___ · `n_scored` ___  
**CI gate thresholds (tomorrow):** faithfulness ≥ ___ · answer_relevance ≥ ___ · context_precision ≥ ___ · context_recall ≥ ___ · refuse ≥ ___

Placeholder file the UI already reads: `eval/ragas-eval-results.placeholder.json` (mirror under `src/lib/clinic/ragas-eval-placeholder.json`).

---

## 3. Trade-offs

1. **Latency vs trust.** Agentic turns add plan (+ optional follow-up) and a support judge on top of hybrid retrieve + re-rank. Free-tier flake can increase timeouts and fail-closed refusals.
2. **Ceiling on A3 matching.** A3 faithfulness/relevance hit 5.00 on matching; headroom for “improvement” lives in harder categories (edge, noisy, policy, multi-hop, refusal) and in RAGAS context precision/recall — not in re-quoting 5.00.
3. **Scale bridge, not identity.** Hit@5 / P@5 ≈ context recall / precision only conceptually. The write-up must say “bridge,” not “equal.”
4. **Static UI vs live harness.** Today’s metrics panel shows harness-shaped JSON with blanks so UX lands before office secrets / live RAGAS. Swapping the JSON (or injecting a completed report) is enough for the dashboard; wiring CI is a separate step.
5. **Fail-closed refuse.** If the support judge is down, the tool refuses. Safer for a clinic assistant; can look like regressions under quota pressure unless the eval counts expected refuses separately.

---

## 4. Limits

- Synthetic FAQ / OKF / anonymised notes only — no real PHI; results do not generalise to a production clinic corpus without re-evaluation.
- RAGAS itself uses an LLM judge (free Gemini / LiteLLM path): scores are approximate and flake-sensitive.
- Agentic planning is capped (max 2 sub-queries, limited hops) — not unbounded research agents.
- Langfuse tracing and the CI regression gate are **not** claimed in this draft.
- UI quality panel is receptionist `/metrics` only (same role gate as existing AI metrics).
- Edge Function deploy is required for agentic behaviour (`npx supabase functions deploy carebridge-ai-v3`); Vercel alone does not ship it.

---

## 5. Demo checklist (once numbers land)

1. Receptionist opens **AI metrics** → **RAGAS quality (Assessment 4)** panel shows filled scores (not “—”).
2. Patient/staff chat (v3): out-of-corpus question → clear refuse; multi-facet question → cited answer; tool metadata `agentic.*` shows plan / hops.
3. Attach this write-up with completed tables + short demo clip to Dev Control Tower; tag `assessment-4` when the stack merges.

---

## 6. Merge note

Stack on agentic RAG (`cursor/agentic-rag-v3-6a98` / PR #1). Merge **after** (or together with) the agentic PR — this UI branch assumes that Edge path. Do **not** merge until Shahriar approves; Langfuse remains a later slice.
