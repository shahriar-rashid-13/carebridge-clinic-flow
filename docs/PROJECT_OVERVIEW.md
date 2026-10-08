# CareBridge: Project Overview

CareBridge is a clinic appointment and patient management app with an AI assistant. It was built
for SJ Innovation Assessments 1 to 3 by Shahriar Rashid. This document explains how the whole
system fits together: the parts, the data flows, and the main design decisions. Read it first,
then the README of each repository for setup details.

All patient, doctor, and medical data in this project is synthetic.

**Assessment 3 (8 October 2026).** Sections 1 to 13 describe the Assessment 2 system; section 14
describes what Assessment 3 added and changed (multi-agent assistant v3, email and calendar
integrations, recall campaigns, gte-small search on 20,758 records, evaluation, CI, Sentry and the
metrics page). The architecture diagram is `carebridge-clinic-flow/docs/assessment-3/architecture.png`, and the
results are in `carebridge-clinic-flow/docs/assessment-3/ASSESSMENT_3_REPORT.md`.

---

## 1. The three repositories

| Folder | What it is | Where it runs |
|---|---|---|
| `carebridge-clinic-flow` | The web app (React), the Supabase database migrations, and the AI Edge Function | Vercel (frontend) and Supabase (database, auth, Edge Functions) |
| `carebridge-liteLLM` | A LiteLLM proxy: one OpenAI-compatible API in front of Gemini and OpenRouter models | Vercel (Python function) |
| `carebridge-rag` | The synthetic knowledge corpus (20,758 records since Assessment 3), the embed and upload scripts, the search evaluations, and the no-show model | Run locally; writes to Supabase |

Live URLs:

- App: https://carebridge-clinic-flow.vercel.app
- Model gateway: https://carebridge-lite-llm.vercel.app (server-to-server only)
- Supabase project: `pfvmpvbwdavusvwbddrd`

---

## 2. Architecture

The Assessment 3 diagram (multi-agent v3, integrations, offline evaluation) is
`carebridge-clinic-flow/docs/assessment-3/architecture.png`. The text diagram below is the Assessment 2
system.

```text
                        Browser (React app on Vercel)
                         |                      |
       Supabase JS client (user JWT)     supabase.functions.invoke("carebridge-ai-v2")
                         |                      |
                         v                      v
   +-------------------------------------------------------------------+
   | Supabase                                                          |
   |                                                                   |
   |  Auth (email/password, Google)                                    |
   |                                                                   |
   |  Postgres 17 with Row Level Security                              |
   |    clinic tables: profiles, doctors, appointments,                |
   |                   prescriptions, bills                            |
   |    AI tables:     ai_conversations, ai_messages,                  |
   |                   ai_pending_actions                              |
   |    automations:   notifications, waitlist, waitlist_offers,       |
   |                   appointment_followups                           |
   |    knowledge:     rag_documents (pgvector + full text + trigram)  |
   |    pg_cron job "clinic-automations" (every 15 minutes)            |
   |                                                                   |
   |  Edge Function carebridge-ai-v2 (Deno)                            |
   |    auth, rate limits, tool loop, proposal cards, RAG search       |
   +-----------------------------------|-------------------------------+
                                       | HTTPS, master key
                                       v
                     LiteLLM proxy on Vercel (carebridge-liteLLM)
                       carebridge-agent       -> Gemini 3.1 Flash Lite
                       carebridge-agent-retry -> Gemini 3.1 Flash Lite
                       carebridge-agent-fallback   -> OpenRouter Nvidia Nemotron
                       carebridge-agent-fallback-2 -> OpenRouter Qwen 3.8 27B
                       carebridge-embed       -> Gemini embedding-001 (768 dims)

   carebridge-rag (local) --embed via LiteLLM--> upsert into rag_documents
```

The key boundaries:

- **The browser never talks to a model.** It talks to Supabase only. All AI calls go through the
  Edge Function, which then calls LiteLLM.
- **LiteLLM knows nothing about the clinic.** It has no database access, no user identity, and no
  tools. It only routes model requests and holds provider keys.
- **The Edge Function never bypasses security.** It creates its Supabase client with the anon key
  plus the caller's JWT, so every query the AI makes is filtered by the same Row Level Security
  (RLS) policies as the app itself. The AI can only see what the signed-in user can see.
- **Business rules live in Postgres.** Slot conflicts, role promotion, waitlist offers, and
  reminders are enforced by constraints, RLS, security-definer functions, triggers, and cron. The
  app and the AI both call the same rules, so they cannot drift apart.

---

## 3. Users and roles

Every account has a row in `profiles` with a `role`: `patient`, `doctor`, or `receptionist`.
New sign-ups are patients. A receptionist can promote a patient to doctor or receptionist
(`promote_patient_to_doctor`, `promote_patient_to_receptionist`).

| Role | What they do in the app |
|---|---|
| Patient | Book appointments, see their appointments, prescriptions, and bills, join the waitlist, accept waitlist offers, chat with the assistant |
| Doctor | See their schedule and patients, run a consultation (diagnosis, prescription, notes), complete visits |
| Receptionist | Confirm, reschedule, and cancel appointments, manage doctors and patients, create and settle bills, handle no-show follow-ups, see reports |

Demo accounts (Sarah Jenkins, Dr. Marcus Vance, Clara Morgan) are listed on the login page.

RLS is on for every table (an event trigger, `ensure_rls`, enables it on any new table). Patients
see only their own rows, doctors see their own patients and appointments, and receptionists see
the clinic-wide data they need.

---

## 4. The web app (`carebridge-clinic-flow/src`)

- **Stack:** React 19, TanStack Start and TanStack Router (file-based routes), Vite, Tailwind,
  shadcn/ui components. The UI started as a Lovable prototype and was then connected to Supabase.
- **Auth** (`src/lib/auth/store.ts`): Supabase email/password and Google sign-in. After sign-in it
  loads the user's `profiles` row to get the role.
- **Clinic state** (`src/lib/clinic/store.tsx`): loads profiles, doctors, appointments,
  prescriptions, and bills from Supabase and exposes actions (book, confirm, cancel, complete a
  consultation, bill). `adapters.ts` converts database rows to UI types.
- **Automations UI** (`src/lib/clinic/automations.ts`, `components/clinic/automation-panels.tsx`,
  `notification-bell.tsx`): the notification bell, the waitlist and offer panels, and the
  receptionist follow-up list.
- **AI panel** (`components/clinic/carebridge-ai-panel.tsx`, route `/ai`): the chat UI. It keeps
  conversations in `ai_conversations`, shows proposal cards with Confirm and Cancel buttons, and
  calls the Edge Function named in `VITE_AI_FUNCTION` (set to `carebridge-ai-v2` in production).
- **Routes** (`src/routes/_authenticated/`): `dashboard`, `book`, `appointments`, `schedule`,
  `consult.$id`, `prescriptions`, `records`, `patients`, `doctors`, `billing`, `reports`,
  `profile`, `ai`. The sidebar changes by role.

---

## 5. Data flow: booking an appointment

1. The patient picks a doctor, date, and slot on `/book`. Available slots come from the doctor's
   working days and slot list minus the slots already taken. `get_taken_slots` is a
   security-definer function that returns only taken times, never who booked them.
2. The app inserts an `appointments` row with status `requested`.
3. A partial unique index (doctor, date, slot, for non-cancelled rows) blocks double booking at the
   database level, even if two people click at the same time.
4. A receptionist confirms it (`confirmed`). The doctor later opens it in `consult.$id`, writes the
   diagnosis and prescription, and completes it (`completed`). The receptionist then bills the
   visit.

Days and slots are normalized (`Mon`..`Sun`, `09:00 AM` format) by a migration so the app, the AI,
and the automations all compare the same strings. The clinic timezone is Asia/Dhaka.

---

## 6. Automations (Track 2)

Defined in `supabase/migrations/20260929010000_automations.sql`. They run without anyone clicking.

### 6.1 Reminders and no-show follow-ups (schedule)

A pg_cron job, `clinic-automations`, runs `run_clinic_automations()` every 15 minutes:

- **24-hour reminders:** every confirmed appointment that starts within the next 24 hours gets one
  `reminder_24h` notification for the patient. A unique constraint stops duplicates.
- **No-shows:** a confirmed appointment that started 1 hour to 7 days ago and was never completed
  gets an `appointment_followups` row, and every receptionist gets a `no_show` notification. The
  receptionist resolves it with `resolve_followup`.
- **Offer expiry:** see below.

Receptionists can also trigger a run with `run_clinic_automations_now()`.

### 6.2 Waitlist fill (event)

```text
Patient joins waitlist (join_waitlist) for a doctor and date
        |
Appointment is cancelled or moved  --> trigger appointment_slot_freed
        |
offer_slot(): oldest "waiting" entry for that doctor and date gets a waitlist_offers row
              (expires in 120 minutes) and a waitlist_offer notification
        |
   +----+-------------------+----------------------------+
   | accept_waitlist_offer  | decline_waitlist_offer     | no answer in 120 min
   | books the slot         | slot goes to next patient  | cron marks it expired,
   | (status requested)     |                            | slot goes to next patient
   +------------------------+----------------------------+
```

Waiting entries whose date has passed are expired by the cron job.

---

## 7. The AI assistant (Track 1)

The Edge Function `supabase/functions/carebridge-ai-v2` is an agent with tools. (`carebridge-ai`
is the older direct-Gemini version, kept for reference.)

### 7.1 One chat turn

```text
Browser --POST {conversationId, message}--> carebridge-ai-v2
  1. Verify JWT, load role from profiles
  2. Rate limit: 30 messages per minute, 1,000 per day (counted from ai_messages)
  3. Load history: last 16 messages, at most 24,000 characters
  4. Build system prompt: role, today's date (Asia/Dhaka), rules, tools allowed for this role
  5. Tool loop (at most 4 rounds, 6 tool calls per round, 120 s total budget):
       call LiteLLM "carebridge-agent" (55 s timeout)
       if the model asks for tools: run them against Supabase with the user's JWT,
       append results, call the model again
  6. Save user and assistant messages with ai_append_turn
     (metadata: models used, tools called, fallback calls, latency)
  7. Return the reply and any proposal cards
```

### 7.2 Tools by role

| Group | Tools |
|---|---|
| All roles | `get_doctors`, `get_available_slots`, `search_knowledge` |
| Patient | `get_my_appointments`, `get_my_prescriptions`, `get_my_profile`, `get_my_bills`, `get_my_waitlist` |
| Doctor | `get_my_schedule`, `get_patient_summary`, `get_patient_history` |
| Receptionist | `search_patients`, `get_appointments`, `get_unbilled_visits`, `get_bills`, `get_followups` |

Read tools run immediately. Tool arguments are validated before any query runs.

### 7.3 Write actions: proposal cards

The AI never changes data directly. Write tools only create a **proposal**:

1. The model calls, for example, `propose_booking`. The function checks the input and stores a
   row in `ai_pending_actions` (`ai_create_pending_action`).
2. The chat shows a card: "Book Dr. X on Tue 6 Oct at 10:00 AM?" with Confirm and Cancel.
3. On Confirm, the browser sends a confirm request. The function claims the action
   (`ai_claim_pending_action`, so it can run only once), re-checks it, performs it with the
   user's JWT, and finishes it (`ai_finish_pending_action`).

Proposal tools:

- Patient: `propose_booking`, `propose_cancel_my_appointment`, `propose_reschedule_my_appointment`,
  `propose_join_waitlist`, `propose_accept_waitlist_offer`
- Doctor: `propose_complete_consultation`
- Receptionist: `propose_confirm_appointment`, `propose_reschedule_appointment`,
  `propose_cancel_appointment`, `propose_create_bill`, `propose_mark_bill_paid`,
  `propose_promote_to_doctor`, `propose_promote_to_receptionist`, `propose_resolve_followup`

### 7.4 Safety rules in the prompt

- The assistant gives guidance, not diagnosis. It may suggest a specialization to book, clearly
  labelled as not medical advice.
- It uses live tools for the user's own data and `search_knowledge` for general questions.
- It answers knowledge questions only from search results and says it does not know when nothing
  relevant is found.
- Retrieved records describe other, anonymised patients; it never names anyone from them.
- It never gives the user a medicine dose; only a doctor can prescribe.
- For emergencies it tells the user to call 999.

---

## 8. Model gateway and fallbacks (`carebridge-liteLLM`)

The Edge Function always asks for the model group `carebridge-agent`. LiteLLM decides which real
model answers:

```text
carebridge-agent             Gemini 3.1 Flash Lite          12 s timeout
   on failure
carebridge-agent-retry       same Gemini model (handles short 503 "high demand" errors)
   on failure
carebridge-agent-fallback    OpenRouter Nvidia Nemotron 3 Ultra (free)
   on failure
carebridge-agent-fallback-2  OpenRouter Qwen 3.8 27B (free, second key, reasoning off)
```

- Each step has a 12 s timeout and `num_retries: 0`, so the worst case is 48 s, below the Edge
  Function's 55 s gateway timeout.
- LiteLLM returns the header `x-litellm-model-group`. The Edge Function reads it to record whether
  a backup model answered (`fallback_calls` in the turn metadata).
- Swapping a provider is a config change in `litellm_config.yaml`; the app code does not change.
- Keys (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_API_KEY_2`, `LITELLM_MASTER_KEY`) live
  only in Vercel environment variables.

---

## 9. RAG: the knowledge base (Track 3)

### 9.1 The corpus (`carebridge-rag`)

5,110 synthetic records, all validated:

| Type | Count | Example content |
|---|---|---|
| Visit notes (`VN-…`) | 2,580 | Complaint, findings, diagnosis, plan for a fictional patient |
| Prescriptions (`RX-…`) | 2,300 | Medicines and instructions for a diagnosis |
| FAQ (`FAQ-…`) | 230 | Clinic policies: hours, booking, billing, and more |

They cover 12 specializations. A deterministic manifest (seed 20260929) fixes the facts first; an
LLM writes the text; a validator checks the text against the manifest; a build script merges
everything into `corpus/corpus_clean.jsonl`. 120 FAQ rows describe fictional doctors, so they are
stored hidden (`rag_visible = false`) and never shown to the AI.

### 9.2 Ingestion

```text
corpus_clean.jsonl --> scripts/embed-upload.mjs
     batches of 50 texts --> LiteLLM /embeddings (carebridge-embed, 768 dims)
     --> PostgREST upsert into rag_documents (on conflict doc_id), service role key
```

The script skips rows that already have an embedding, so it can be stopped and resumed. It backs
off on HTTP 429 and 5xx.

### 9.3 Storage and search

`rag_documents` has one row per record with `content`, filters (`record_type`, `specialization`,
`diagnosis`, `faq_topic`), `embedding vector(768)`, and a generated full-text column. Indexes:
HNSW (cosine) on the embedding, GIN on full text, trigram on content.

`match_rag_documents(query_text, query_embedding, ...)` runs three searches and merges them with
reciprocal rank fusion:

1. semantic: cosine similarity, kept only if at least 0.55;
2. full text: an any-word (OR) English `tsquery` built from the question;
3. fuzzy: trigram similarity, kept if at least 0.6 (typo tolerance).

If the embedding call fails, the function still returns keyword matches. RLS lets signed-in users
read only visible, non-noise rows; nobody but the service role can write.

Measured similarity: relevant questions score about 0.70 to 0.84; off-topic questions about 0.44,
so the 0.55 cutoff returns nothing for unrelated questions.

### 9.4 Query time

```text
User: "What is the cancellation policy?"
  model calls search_knowledge {query, optional record_type, specialization}
    embed query (8 s timeout) --> match_rag_documents with user JWT (top 5)
    anonymise text: patient names --> "the patient", doctor names --> "the doctor"
    return results labelled "Clinic FAQ" / "Anonymised past visit note (another patient)" / ...
  model answers only from these results, or says it does not know
```

### 9.5 Current status

- 1,960 of 5,110 records are embedded: all 230 FAQ rows and prescriptions `RX-000001` to
  `RX-001730`. Visit notes are not embedded yet.
- The rest is waiting for Gemini free-tier quota (about 1,000 embeddings per day per project).
  Re-running the upload script continues where it stopped.
- The evaluation (matching, edge, and noisy query sets, with and without 300 noise rows) is in
  `carebridge-rag/eval/RAG_EVAL_REPORT.md` and summarised in `ASSESSMENT_2_REPORT.md`.

---

## 10. Tests (Track 5)

In `carebridge-clinic-flow/tests`, run with one command:

| Command | What it runs |
|---|---|
| `npm test` | Vitest: 209 unit and Edge Function tests |
| `npm run test:coverage` | Same, with a coverage report |
| `npm run test:e2e` | Playwright: login and booking happy paths |

- `tests/unit`: auth store, clinic store, adapters, automations, AI panel, notification bell,
  automation panels.
- `tests/edge`: the Edge Function handler, read tools, proposal actions, the gateway client
  (fallback detection, embeddings), and `search_knowledge` (validation, anonymisation, keyword-only
  mode). An in-memory database (`tests/helpers/memory-db.ts`) stands in for Supabase.
- `carebridge-liteLLM/tests`: a Python proxy test and a PowerShell tool round-trip script.

---

## 11. Deployment and configuration

| Part | How it deploys | Secrets / settings |
|---|---|---|
| Frontend | Vercel, auto-deploys on push to `main` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AI_FUNCTION` |
| Database | Migrations in `supabase/migrations`, applied with the Supabase CLI | none in the repo |
| Edge Function | `npx supabase functions deploy carebridge-ai-v2` | Supabase secrets `LITELLM_BASE_URL`, `LITELLM_API_KEY`, optional `CLINIC_TIMEZONE` |
| LiteLLM | Vercel, auto-deploys on push | `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_API_KEY_2`, `LITELLM_MASTER_KEY` |
| RAG upload | Run locally | `.env` in `carebridge-rag`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY` |

No secret is committed. Every `.env` file is gitignored.

---

## 12. Assessment tracks at a glance

| Track | Status |
|---|---|
| 1. AI agent with tools | Done: role-aware agent, read tools, confirm-before-write proposals |
| 2. Two automations | Done: reminders and no-show follow-ups (cron); waitlist fill (trigger) |
| 3. RAG on 5,000+ records | Corpus done (5,110); search integrated; 1,960 embedded; evaluated (hit rate 1.00 / 0.96 / 0.97 on matching / edge / noisy queries, clean index) |
| 4. Classification with at least 70% accuracy | Done: specialization from symptoms, 100% held-out, 79.2% (TF-IDF) and 89.6% (Gemini) on hand-written descriptions |
| 5. Tests | Done: 209 Vitest tests and 10 Playwright end-to-end tests |
| 6. UI/UX | Loading, empty, and error states, notification bell, chat with proposal cards |
| 7. Docs | This overview, `ASSESSMENT_2_REPORT.md`, and the three READMEs |

## 13. Known limits

- Free model tiers: Gemini and OpenRouter free quotas can run out. The fallback chain reduces
  outages but cannot remove them.
- The base clinic schema (profiles, doctors, appointments, prescriptions, bills) was created in
  Assessment 1; `supabase/migrations` holds the Assessment 2 and 3 changes on top of it.

---

## 14. Assessment 3 changes

### 14.1 Multi-agent assistant (`carebridge-ai-v3`)

Production now calls `carebridge-ai-v3` (`VITE_AI_FUNCTION`). v2 stays deployed as the
evaluation baseline. One turn:

```text
message --> emergency gate (approved text, no model)
        --> guardrails: length, injection patterns, PII redaction ([PHONE_1], [EMAIL_1], ...)
        --> supervisor (JSON: agent, handoffs, knowledge okf|rag|none, okf_id, confidence)
              invalid twice --> keyword router;  confidence < 0.6 --> one clarifying question
        --> specialist (triage | scheduling | billing | records), then up to 2 handoffs
              tools run with the user's JWT; write tools only create proposal cards
              get_policy: 15 OKF policy files;  search_knowledge: 20 candidates re-ranked to 5
        --> output checks (no doses, no tool text, no ids), merge replies, restore PII
        --> save turn with metadata (route, agents, tools, models, tokens, latency)
```

Shared memory: `ai_conversation_state` (one row per conversation, RLS, 24-hour expiry) keeps the
specialization, doctor, date and pending requests between turns. Read-only lookups
(`get_policy`, `get_doctors`, `get_my_profile`, `search_patients`) are shared by all specialists;
each `propose_*` tool belongs to exactly one specialist.

### 14.2 Model gateway

```text
carebridge-agent             Gemini 3.1 Flash Lite, key 1        12 s
carebridge-agent-retry       same model, key 2 (second project)  12 s
carebridge-agent-fallback    OpenRouter Nvidia Nemotron 3 Ultra   12 s
carebridge-agent-fallback-2  OpenRouter Qwen 3.8 27B              12 s
carebridge-embed / -embed-2  Gemini embedding-001, key 1 then key 2
carebridge-judge / -judge-2  Gemini 3.5 Flash, evaluations only
```

Gemini thought signatures work across both keys, so a tool round can continue on the other key.
The v3 supervisor waits 25 s so the second key can answer before the keyword router takes over.

### 14.3 Integrations and campaigns

- **Resend email:** `reminder_24h` notifications queue `message_outbox` rows; `pg_cron` calls
  `message-dispatcher` every minute (retries 1, 5, 15, 60 minutes; quiet hours 22:00 to 08:00;
  opt-out checks). `resend-webhook` verifies the Svix signature and moves the status forward only.
- **Google Calendar:** appointment changes queue `calendar_jobs`; `calendar-sync` creates, moves
  or deletes events in the shared clinic calendar, with event ids derived from appointment ids.
- **Recall campaigns** (`/campaigns`): three segments, preview, send, daily allowance of 100,
  signed unsubscribe links, frequency cap, and results with 14-day bookings.

### 14.4 Knowledge search at 20,758 records

All records are embedded locally with gte-small (384 dims, `embedding_gte`); the Edge runtime
embeds queries with the same model (`Supabase.ai`), so no embedding API quota is used at query
time. The cosine cutoff is 0.82. v3 asks `match_rag_documents` for 20 candidates and re-ranks
them to 5 with the chat model (6 s, then the fused order). Medicine amounts in other patients'
records are replaced with `[dose omitted]`.

### 14.5 Evaluation, observability and CI

- Agent evaluation: 42 labelled scenarios, v2 vs v3, `carebridge-clinic-flow/eval/`.
- Search evaluation: A2 vs A3a vs A3b, judged answers, policy questions,
  `carebridge-rag/eval/SEARCH_EVAL_V3_REPORT.md`.
- No-show model: `carebridge-rag/noshow/NOSHOW_REPORT.md`.
- GitHub Actions on every push (type check, 464 tests, build, Playwright); Sentry for the browser
  and Edge Functions; `/metrics` for receptionists; Supabase advisor before and after lists in
  `carebridge-clinic-flow/docs/assessment-3/supabase-advisors.md`.
