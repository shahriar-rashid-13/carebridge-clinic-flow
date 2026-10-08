# CareBridge — Assessment 2 submission report

SJ Innovation · Assessment 2 (continuation of Assessment 1) · Shahriar Rashid · 1 October 2026


**Stack:** Vite · React 19 · TypeScript · TanStack Start/Router · Tailwind · Supabase (Postgres 17,
Auth, RLS, pg_cron, pgvector, Edge Functions on Deno) · LiteLLM on Vercel · Gemini 3.1 Flash Lite
and Gemini embedding-001 · OpenRouter free models as fallbacks · Vitest · Playwright · scikit-learn.

All patient, doctor, and medical data is synthetic.

---

## Submission checklist

| # | Requirement (Dev Control Tower) | Status |
|---|---|---|
| 1 | Live URL (Vercel) and GitHub repos | Done (section 1) |
| 2 | README and demo notes: agent, 2 workflows, RAG design, how to run tests | Done (sections 2 to 4 and 6; READMEs updated in all three repos) |
| 3 | RAG evaluation with vs without noise | Done (section 4.4) |
| 4 | Accuracy of at least 70%, and the model used | Done (section 5) |
| 5 | Unit tests and at least one E2E happy path, passing | Done: 209 Vitest tests and 10 Playwright tests pass (section 6) |
| 6 | Test credentials per role | Done (section 8) |

## Tracks against the scoring sheet

| Track |  What was delivered |
|---|---|
| 1. AI agent | Role-aware tool-calling agent: 16 read tools and 14 write tools; write tools need confirmation. Multi-step tool loop. Covers both Option A (triage to a specialization) and Option B (books and looks up visits). |
| 2. Two workflows | 24-hour reminders and no-show follow-ups run on a pg_cron schedule. Waitlist fill runs from a database trigger when a slot frees up. |
| 3. RAG on 5,000+ records | 5,110 synthetic records. Hybrid pgvector, full-text, and trigram search. Three query sets evaluated with and without noise. |
| 4. LLM and at least 70% accuracy | Gemini through LiteLLM. Specialization classifier: 100% held-out, 79.2% on hand-written text; the Gemini zero-shot variant scores 89.6% on hand-written text. |
| 5. Test automation | 209 unit and Edge Function tests, plus 10 end-to-end tests (login and full booking flow). |
| 6. UI/UX | Loading, empty, and error states. Chat with proposal cards. Notification bell. Waitlist and follow-up panels. |
| 7. Docs and DCT | This report, three READMEs, and the evaluation reports. |
| Bonus | The agent takes real multi-step actions, but only after the user confirms. Ollama was tested (qwen2.5 3B) but not adopted: too slow for the agent loop. |

---

## 1. Live URL and GitHub

| Item | Value |
|---|---|
| Live app (Vercel) | https://carebridge-clinic-flow.vercel.app |
| App, database migrations, Edge Function | https://github.com/shahriar-rashid-13/carebridge-clinic-flow |
| Model gateway (LiteLLM on Vercel) | https://github.com/shahriar-rashid-13/carebridge-liteLLM (deployed at https://carebridge-lite-llm.vercel.app, server-to-server only) |
| RAG corpus, upload, and evaluation | https://github.com/shahriar-rashid-13/carebridge-rag |
| Branch | `main` in all three repos |

Local run (app):

```bash
cd carebridge-clinic-flow
# .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_AI_FUNCTION=carebridge-ai-v2
npm install
npm run dev
```

Architecture in one picture:

```text
Browser (React, Vercel)
   | Supabase JS (user JWT)            | functions.invoke("carebridge-ai-v2")
   v                                   v
Supabase: Auth · Postgres + RLS · pg_cron · pgvector · Edge Function carebridge-ai-v2
                                       | HTTPS + master key
                                       v
                LiteLLM (Vercel): Gemini -> Gemini retry -> OpenRouter Nvidia -> OpenRouter Qwen
                                  Gemini embedding-001 for RAG
```

The browser never calls a model directly. The Edge Function queries Supabase with the user's own
JWT, so every AI tool is limited by the same Row Level Security as the app.

---

## 2. AI agent (Track 1)

**Where:** sign in, then open **AI Assistant** (`/ai`). The assistant is available to all three
roles.

**What it does:**

- Answers with live data through role-specific read tools, for example "What are my upcoming
  appointments?", "Show today's schedule", or "Which visits are unbilled?".
- Triage (Option A): from a described concern it suggests the specialization to book. The answer
  is labelled as guidance, not medical advice. It then lists real doctors and free slots.
- Takes actions (Option B): book, cancel, reschedule, confirm, bill, mark paid, promote a user,
  complete a consultation, join the waitlist, accept an offer, and resolve a follow-up. The AI only
  proposes an action. A card with **Confirm** and **Cancel** appears, and nothing changes until the
  user confirms.
- Answers general clinic and condition questions from the RAG knowledge base (`search_knowledge`).
  Retrieved records are anonymised, and the agent says "I don't know" when nothing relevant is
  found.

**How one turn works:**

1. Verify the JWT and load the role.
2. Apply rate limits: 30 messages per minute and 1,000 per day.
3. Load the last 16 messages.
4. Run the tool loop: at most 4 rounds and 6 tool calls per round, within a 120 s budget.
5. Save the turn with metadata: models used, tools called, fallback calls, and latency.

| Role | Read tools | Write tools (proposal, then confirm) |
|---|---|---|
| All | `get_doctors`, `get_available_slots`, `search_knowledge` | — |
| Patient | `get_my_appointments`, `get_my_prescriptions`, `get_my_profile`, `get_my_bills`, `get_my_waitlist` | `propose_booking`, `propose_cancel_my_appointment`, `propose_reschedule_my_appointment`, `propose_join_waitlist`, `propose_accept_waitlist_offer` |
| Doctor | `get_my_schedule`, `get_patient_summary`, `get_patient_history` | `propose_complete_consultation` |
| Receptionist | `search_patients`, `get_appointments`, `get_unbilled_visits`, `get_bills`, `get_followups` | `propose_confirm_appointment`, `propose_reschedule_appointment`, `propose_cancel_appointment`, `propose_create_bill`, `propose_mark_bill_paid`, `propose_promote_to_doctor`, `propose_promote_to_receptionist`, `propose_resolve_followup` |

**Models:** the Edge Function always asks LiteLLM for the model group `carebridge-agent`. LiteLLM
then tries each model in order. Each step has a 12 s timeout and there are no retries inside a step,
so the worst case is 48 s, under the Edge Function's 55 s limit. Keys stay on the server and are
never in `VITE_` variables.

```text
gemini/gemini-3.1-flash-lite -> same model (retry for 503 "high demand")
  -> openrouter/nvidia/nemotron-3-ultra-550b-a55b:free -> openrouter/qwen/qwen3.8-27b:free
```

**Safety rules in the system prompt:**

- Guidance only; the assistant never diagnoses.
- It never gives a dose; only a doctor can prescribe.
- It never names people from retrieved records.
- For emergencies it says to call 999.
- It uses live tools for the user's own data and RAG only for general knowledge.

**Key files** (in `carebridge-clinic-flow`):

| Layer | Path |
|---|---|
| Handler: auth, limits, tool loop, confirm and cancel | `supabase/functions/carebridge-ai-v2/index.ts` |
| Read tools and registry | `supabase/functions/carebridge-ai-v2/tools.ts` |
| Proposal (write) tools | `supabase/functions/carebridge-ai-v2/actions.ts` |
| RAG tool | `supabase/functions/carebridge-ai-v2/tools-knowledge.ts` |
| LiteLLM client: chat, embeddings, fallback detection | `supabase/functions/carebridge-ai-v2/gateway.ts` |
| Chat UI with proposal cards | `src/components/clinic/carebridge-ai-panel.tsx` |
| Model routing | `carebridge-liteLLM/litellm_config.yaml` |

Chat history is stored in `ai_conversations` and `ai_messages`. Pending actions are stored in
`ai_pending_actions`; each one can be claimed once, so a double click cannot run it twice.

---

## 3. Two workflows / automations (Track 2)

Installed by `supabase/migrations/20260929010000_automations.sql` in `carebridge-clinic-flow`. Both run without anyone
clicking through the steps.

| Workflow | Trigger | Behaviour |
|---|---|---|
| 1. Appointment reminders and no-show follow-up | Schedule: pg_cron job `clinic-automations`, every 15 minutes, runs `run_clinic_automations()` | Each confirmed visit that starts within 24 h gets one `reminder_24h` notification; a unique constraint prevents duplicates. A confirmed visit not completed 1 h after its start (up to 7 days back) gets an `appointment_followups` row, and every receptionist gets a `no_show` notification. The receptionist resolves it in the follow-up panel or through the AI. |
| 2. Waitlist fill | Event: trigger `appointment_slot_freed` fires when an appointment is cancelled or moved | `offer_slot()` offers the freed slot to the oldest waiting patient for that doctor and date. The offer lasts 120 minutes and comes with a `waitlist_offer` notification. Accepting books the slot. Declining, or no answer (expired by the cron job), passes the slot to the next patient. |

Receptionists can also run the scheduled job at once with `run_clinic_automations_now()`.

**Demo checks:**

1. As a patient, join the waitlist for a doctor and date that is fully booked.
2. As a receptionist, cancel one appointment on that date. The waitlisted patient's bell shows the
   offer at once, and accepting it books the slot.
3. Book and confirm a visit within the next 24 hours. After the next cron run (at most 15 minutes),
   the patient sees a reminder.
4. Leave a confirmed visit uncompleted past its start time. Receptionists get a "Possible no-show"
   notification and a follow-up item.

---

## 4. RAG (Track 3)

### 4.1 Corpus

5,110 synthetic records in `carebridge-rag/corpus/corpus_clean.jsonl`. They cover 12
specializations and 48 diagnoses.

| Type | Count | Content |
|---|---|---|
| Visit notes | 2,580 | Complaint, history, findings, assessment, and plan |
| Prescriptions | 2,300 | Diagnosis, medicines with dose, frequency, and duration, and advice |
| FAQ | 230 | Clinic policy: accounts, booking, cancel and reschedule, waitlist, billing, symptom routing, visit preparation |

How the records were made:

1. A deterministic manifest (seed 20260929) fixes the facts.
2. An LLM writes the text.
3. A validator checks each record against the manifest; 40 records failed and were dropped.
4. A build script merges everything.

120 FAQ rows describe fictional doctors, so they are stored hidden and never shown to users.

### 4.2 Pipeline

```text
corpus_clean.jsonl -> embed-upload.mjs -> LiteLLM carebridge-embed (gemini-embedding-001, 768 dims)
  -> Supabase rag_documents (pgvector HNSW + full-text GIN + trigram index, RLS: read-only, visible rows only)
question -> search_knowledge tool -> embed question -> match_rag_documents (top 5)
  -> anonymise names -> model answers only from the results
```

`match_rag_documents` combines three rankings with reciprocal rank fusion:

- semantic (cosine similarity, at least 0.55);
- full text (any word matches);
- fuzzy (trigram similarity, at least 0.6, for typos).

If the embedding call fails, the search keeps the keyword matches, so it still works.

**Upload status:** 1,960 of 5,110 records are embedded: all 230 FAQ rows and prescriptions
`RX-000001` to `RX-001730`. The Gemini free tier allows about 1,000 embeddings per day. Running the
upload script again continues where it stopped, so the rest can be loaded when quota allows.

**Demo:** ask the assistant "What is the cancellation policy?", "How long do I have to accept a
waitlist offer?", "Which doctor should I see for itchy red eyes?", or "What is usually prescribed
for typhoid?". Then ask "What is the capital of France?"; the assistant should say it doesn't know.

### 4.3 Evaluation method

Script: `carebridge-rag/scripts/rag-eval.mjs`. Queries: `carebridge-rag/eval/rag-queries.json`.
Full output: `carebridge-rag/eval/RAG_EVAL_REPORT.md`. Run on 30 September 2026 with k = 5 and
gemini-embedding-001.

**Query sets:**

- **Matching (30):** paraphrased policy questions, symptom questions, and treatment questions.
- **Extreme/edge (30):**
  - very short (`refund`, `BPPV`);
  - long and rambling;
  - ambiguous (`chest pain`, `fever`);
  - multi-intent;
  - rare conditions;
  - policy nuance;
  - 5 out-of-scope questions, where the correct answer is no result.
- **Noisy (30):** the matching queries with typos in about 35% of words plus two junk tokens each,
  for example "Wht are the steps to bok hmm?? a doctor ~~ apopintment?".

**Index noise:** 300 rows were added with `is_noise = true`:

- 100 typo-corrupted duplicates of real records;
- 100 junk rows (keyboard mash mixed with clinic words);
- 100 off-topic rows (cricket, cooking, cars, finance, and similar).

The two index variants:

- **Clean (1,960 rows):** `include_noise = false`. This is what the app uses.
- **With noise (2,260 rows):** `include_noise = true`.

**Relevance:** a result counts as relevant if it is one of the FAQ entries labelled for the query,
or a record with a labelled diagnosis. Noise rows never count as relevant.

**Metrics:**

- **Hit rate:** share of queries with at least one relevant result in the top 5.
- **MRR:** mean reciprocal rank of the first relevant result.
- **P@5:** relevant results divided by 5. A single-answer FAQ query can score at most 0.2.
- **Noise share:** share of the top-5 slots taken by noise rows.

### 4.4 Results: with vs without noise

Hybrid search, which is what the app runs:

| Query set | Hit rate (clean) | Hit rate (with noise) | MRR clean / noise | P@5 clean / noise | Noise share in top 5 |
|---|---|---|---|---|---|
| Matching (30) | **1.00** | **1.00** | 1.00 / 0.97 | 0.47 / 0.41 | 0.35 |
| Extreme / edge (25 answerable) | **0.96** | **0.96** | 0.94 / 0.94 | 0.54 / 0.46 | 0.38 |
| Noisy queries (30) | **0.97** | **0.47** | 0.97 / 0.40 | 0.45 / 0.13 | 0.83 |

Keyword-only mode, which shows what the embedding adds:

| Query set | Hit rate (clean) | Hit rate (with noise) |
|---|---|---|
| Matching | 0.87 | 0.83 |
| Extreme / edge | 0.88 | 0.88 |
| Noisy queries | 0.83 | 0.27 |

Out-of-scope queries, where the correct result is nothing:

| Mode | Clean index | With noise |
|---|---|---|
| Hybrid | 5 of 5 return nothing | 3 of 5 |
| Keyword-only | 3 of 5 | 3 of 5 |

**What the numbers mean:**

- **On a clean index, retrieval is robust.** Hybrid search finds a relevant record for every
  matching query, 24 of 25 edge queries, and 29 of 30 typo-and-junk queries. The embedding is what
  makes typos survivable: keyword-only search drops to 0.83 on noisy queries.
- **The only clean-index edge miss is `chest pain`.** It returned pneumonia prescriptions, whose
  advice text mentions chest pain, instead of the labelled angina and reflux records. This is a
  genuinely ambiguous two-word query.
- **Noise in the index hurts noisy queries most.** With clean queries, noise rows take about a
  third of the top-5 slots, but a relevant record is still found every time. The typo duplicates
  look like the real records, so they compete for slots, but a relevant record stays in first place in
  28 of 30 matching queries (MRR 0.97). With noisy queries, hit rate falls from 0.97 to 0.47: junk tokens in the question ("plz",
  "qwe!!", "###") match the junk rows both semantically and by keyword, so junk wins.
- **Noise also weakens the "I don't know" behaviour.** With noise included, the cricket and car
  questions return the off-topic cricket and car rows instead of nothing.
- **This is why the app filters noise at ingestion.** Rows flagged `is_noise` are invisible to
  users and to the AI through RLS, so production behaves like the clean column. A further
  improvement would be to strip junk tokens from the question before searching.

---

## 5. Accuracy evidence: at least 70% (Track 4)

**Task:** predict the right department (specialization) from a symptom description. There are 12
classes.

**Data:** the 2,580 synthetic visit notes. The input is only the patient's complaint and history.
Everything from "On examination" onwards is removed: the findings, the diagnosis, and the plan. The
doctor, the specialization header, and patient names are removed too.

**Split:** about 80/20, stratified by class and grouped by patient, so a patient's follow-up notes
never appear on both sides. That gives 2,064 training notes and 516 held-out notes
(`random_state` 42).

### 5.1 Trained model: TF-IDF + logistic regression (scikit-learn)

| Test set | n | Accuracy | Target | Pass |
|---|---|---|---|---|
| **Held-out visit notes** | 516 | **100.0%** (macro F1 1.000) | at least 70% | **YES** |
| Held-out notes, stress form (first sentence only, typos in about 30% of words) | 516 | 98.4% | — | — |
| Outside test 1: 48 "Symptom routing" FAQ questions (different style) | 48 | 97.9% | — | — |
| Outside test 2: 48 hand-written lay descriptions (`eval/symptom-queries.json`) | 48 | **79.2%** | at least 70% | **YES** |

For comparison:

- Majority-class baseline: 8.3%.
- 5-fold grouped cross-validation on the training set: 100.0% ± 0.0%.
- Extra task, 48-class diagnosis: 100.0% held-out and 98.1% in stress form.

**Honest reading:** the synthetic notes reuse a typical symptom vocabulary per diagnosis, so
held-out notes from the same generator are easy, which explains the 100%. The hand-written set is
the realistic check: it uses everyday wording ("tummy cramps", "feel like a zombie") that never
appears in the corpus. On that set the trained model still clears the target with 79.2%. Its 10
misses are mostly lay phrasing it had not seen, for example "chest feels heavy on the stairs"
predicted as Pulmonology instead of Cardiology.

Confusion matrix on the held-out set (rows are the true class, columns the predicted class; all
predictions fall on the diagonal):

| | GenMed | Cardio | Pulmo | Gastro | Endo | Derm | Ortho | Neuro | ENT | Ophth | ObGyn | Psych |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **GenMed** | 43 | · | · | · | · | · | · | · | · | · | · | · |
| **Cardio** | · | 44 | · | · | · | · | · | · | · | · | · | · |
| **Pulmo** | · | · | 42 | · | · | · | · | · | · | · | · | · |
| **Gastro** | · | · | · | 44 | · | · | · | · | · | · | · | · |
| **Endo** | · | · | · | · | 42 | · | · | · | · | · | · | · |
| **Derm** | · | · | · | · | · | 43 | · | · | · | · | · | · |
| **Ortho** | · | · | · | · | · | · | 44 | · | · | · | · | · |
| **Neuro** | · | · | · | · | · | · | · | 42 | · | · | · | · |
| **ENT** | · | · | · | · | · | · | · | · | 43 | · | · | · |
| **Ophth** | · | · | · | · | · | · | · | · | · | 43 | · | · |
| **ObGyn** | · | · | · | · | · | · | · | · | · | · | 42 | · |
| **Psych** | · | · | · | · | · | · | · | · | · | · | · | 44 |

### 5.2 LLM classifier: Gemini, zero-shot (the model behind the agent)

| Test set | n | Accuracy |
|---|---|---|
| Hand-written lay descriptions | 48 | **89.6%** |
| Held-out notes in stress form (10 per class) | 120 | **88.3%** |

Model: LiteLLM `carebridge-agent` with `gemini/gemini-3.1-flash-lite`, temperature 0; every
request was served by Gemini, with no fallback. The LLM handles lay wording better than the
TF-IDF model: 89.6% against 79.2%. Its 5 misses are clinically close calls:

- burning urination routed to General Medicine instead of Obstetrics and Gynecology;
- irregular periods with acne routed to Endocrinology instead of Obstetrics and Gynecology;
- low vitamin D symptoms routed to General Medicine instead of Endocrinology;
- anaemia-like fatigue routed to Cardiology instead of General Medicine;
- a fever with nausea routed to Gastroenterology instead of General Medicine.

In the product, the agent's triage answer uses this same model and is always labelled as guidance,
not medical advice.

**Reproduce** (from `carebridge-rag/`):

```bash
py -3 -m venv .venv
.venv/Scripts/python -m pip install -r requirements-eval.txt
.venv/Scripts/python scripts/classify-eval.py     # trained model, writes eval/CLASSIFICATION_REPORT.md
node scripts/classify-llm.mjs                     # Gemini zero-shot (needs .env with the LiteLLM key)
```

---

## 6. Tests (Track 5)

From `carebridge-clinic-flow/`:

| Command | What it runs |
|---|---|
| `npm test` | Vitest: unit tests and Edge Function tests (single command) |
| `npm run test:coverage` | The same, with a coverage report |
| `npx playwright install chromium` | One-time browser install for E2E |
| `npm run test:e2e` | Playwright E2E; starts the dev server itself; needs `.env.test` with role credentials |

**Run on 30 September 2026:**

```text
> vitest run
 Test Files  14 passed (14)
      Tests  209 passed (209)
   Duration  29.21s

> playwright test
Running 10 tests using 1 worker
  ok  1 booking flow › patient requests an appointment (14.8s)
  ok  2 booking flow › receptionist confirms it (5.2s)
  ok  3 booking flow › patient sees it confirmed (4.9s)
  ok  4 booking flow › receptionist cancels it (5.8s)
  ok  5 patient can sign in (3.2s)
  ok  6 doctor can sign in (3.5s)
  ok  7 receptionist can sign in (2.7s)
  ok  8 wrong password shows an error and stays on login (2.5s)
  ok  9 signed-out visitors are sent to login (2.6s)
  ok 10 patient sees the AI assistant greeting (6.8s)
  10 passed (1.0m)
```

**What is covered:**

| Module | Test files |
|---|---|
| Auth | `tests/unit/auth-store.test.ts`, E2E `login.spec.ts` |
| Each role's core actions (book, confirm, cancel, consult, bill, promote) | `tests/unit/clinic-store.test.tsx`, `tests/unit/adapters.test.ts`, E2E `booking.spec.ts` |
| Workflows (notifications, waitlist, follow-ups) | `tests/unit/automations.test.ts`, `tests/unit/automation-panels.test.tsx`, `tests/unit/notification-bell.test.tsx` |
| Agent: handler, auth, limits, tool loop, confirm and cancel | `tests/edge/handler.test.ts`, `tests/edge/shared.test.ts` |
| Agent tools | `tests/edge/read-tools.test.ts`, `tests/edge/tools.test.ts`, `tests/edge/actions.test.ts` |
| Model gateway (fallback detection, embeddings) | `tests/edge/gateway.test.ts` |
| RAG tool (validation, anonymisation, keyword-only fallback) | `tests/edge/knowledge.test.ts` |
| Chat UI | `tests/unit/ai-panel.test.tsx` |

The Edge Function tests run the Deno code with an in-memory database and a mocked gateway, so they
need no network or secrets. The E2E booking test creates one appointment and cancels it at the end,
which leaves the live data as it was.

---

## 7. UI/UX (Track 6)

- Separate sidebars and dashboards per role. The layout is responsive.
- Loading, empty, and error states on data pages. Toasts confirm actions.
- Chat UI:
  - conversation list and history;
  - proposal cards with Confirm and Cancel, and status after the action;
  - a clear error when the AI service is unavailable.
- Visible feedback when automations fire:
  - a notification bell with an unread count;
  - waitlist offer cards with a countdown and Accept or Decline;
  - a receptionist follow-up panel for no-shows.

---

## 8. Test credentials (by role)

| Role | Name | Email | Password |
|---|---|---|---|
| Patient | Sarah Jenkins | `sarah@example.com` | 123456 |
| Doctor | Dr. Marcus Vance (Cardiology) | `marcus@example.com` | 123456 |
| Receptionist | Clara Morgan | `clara@example.com` | 123456 |

The login page lists these demo users; one click fills in the email. New sign-ups are patients. A
receptionist can promote a patient to doctor or receptionist from the Doctors page or through the
AI assistant.

---

## 9. Quick demo path

1. **Patient (Sarah):**
   - Open AI Assistant and ask "I have itchy red eyes, who should I see?". It suggests a
     specialization and lists doctors.
   - Ask "Book Dr. Marcus Vance next Tuesday morning". A proposal card appears; press Confirm.
   - Ask "What is the cancellation policy?" to get an answer from RAG.
2. **Receptionist (Clara):** confirm the new appointment on Appointments. Then ask the assistant
   "Which visits are unbilled?" and "Create a bill for …"; a proposal card appears.
3. **Waitlist:** as the patient, join the waitlist for a full day. As the receptionist, cancel an
   appointment on that day. The patient's bell shows the offer; accept it.
4. **Doctor (Marcus):** open Schedule, open a confirmed visit, write the diagnosis and
   prescription, and complete it. The patient then sees the prescription.
5. **Evidence:**
   - Run `npm test` and `npm run test:e2e` in `carebridge-clinic-flow`.
   - Run `node scripts/rag-eval.mjs` and `.venv/Scripts/python scripts/classify-eval.py` in
     `carebridge-rag`.

---

## 10. Known limits

- Only 1,960 of 5,110 RAG records are embedded because of the Gemini free-tier quota. Visit notes
  are not searchable yet. The RAG evaluation was run on this embedded subset (FAQ and
  prescriptions). The upload resumes with one command.
- Every model runs on a free tier. The four-step fallback chain reduces outages but cannot prevent
  them when every provider's quota runs out.
- The held-out classification score is 100% because the synthetic notes are regular. The
  hand-written test (79.2% for TF-IDF, 89.6% for Gemini) is the more realistic number.
- Ollama (qwen2.5 3B) was tested as a backup model but not adopted: it was too slow and too small
  for multi-step tool calling.

## Related documents

| Document | Topic |
|---|---|
| `PROJECT_OVERVIEW.md` | Architecture, data flows, and systems (start here) |
| `carebridge-clinic-flow/README.md` | App, Edge Function, migrations, tests, deployment |
| `carebridge-clinic-flow/project_description_update.md` | Assessment 2 brief |
| `carebridge-liteLLM/README.md` | Model gateway and fallback chain |
| `carebridge-rag/README.md`, `RAG_PLAN.md` | Corpus, upload, RAG design |
| `carebridge-rag/eval/RAG_EVAL_REPORT.md` | Full RAG evaluation output, including every miss |
| `carebridge-rag/eval/CLASSIFICATION_REPORT.md` | Full classification output |
