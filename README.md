# CareBridge Portal

Clinic appointment and patient management app with an AI assistant, built for SJ Innovation
Assessments 2 and 3. Patients book visits, doctors run consultations and write prescriptions,
receptionists confirm appointments, handle billing and run recall campaigns, and a multi-agent AI
assistant looks things up and proposes actions for the user to confirm.

- Live app: https://carebridge-clinic-flow.vercel.app
- Assessment 3 report (evaluation results, tracks, credentials): [`docs/assessment-3/ASSESSMENT_3_REPORT.md`](docs/assessment-3/ASSESSMENT_3_REPORT.md)
- Architecture diagram: [`docs/assessment-3/architecture.png`](docs/assessment-3/architecture.png)
- Whole-project report and system overview: `../FINAL_REPORT.md` and `../docs/PROJECT_OVERVIEW.md`
  in the parent folder, next to the `carebridge-liteLLM` and `carebridge-rag` repositories.

All patient and doctor data is synthetic.

## What is in this repository

| Path | Contents |
|---|---|
| `src/` | React frontend (TanStack Start and Router, Vite, Tailwind, shadcn/ui) |
| `supabase/migrations/` | Database changes: slot conflicts, role promotion, AI tables, automations, RAG, email outbox, campaigns, calendar sync, AI memory and metrics |
| `supabase/functions/carebridge-ai-v3/` | Multi-agent assistant (Assessment 3, live): supervisor, four specialists, guardrails, OKF policy files |
| `supabase/functions/carebridge-ai-v2/` | Single-agent assistant (Assessment 2), kept deployed as the evaluation baseline |
| `supabase/functions/message-dispatcher/`, `resend-webhook/`, `unsubscribe/` | Email reminders and campaigns through Resend, signed delivery webhook, unsubscribe links |
| `supabase/functions/calendar-sync/` | Google Calendar sync for confirmed appointments |
| `supabase/functions/carebridge-ai/`, `embed-check/` | Older direct-Gemini assistant and a gte-small embedding check, kept for reference |
| `eval/`, `scripts/agent-eval*.mjs` | Agent evaluation: 42 labelled scenarios, runner, scorer, saved results and report |
| `docs/` | Assessment 3 report, demo script, architecture diagram and advisor lists (`docs/assessment-3/`); older working documents (`docs/history/`) |
| `tests/` | Vitest unit and Edge Function tests, Playwright end-to-end tests |

## Assessment 3 additions

- **Multi-agent assistant** (`carebridge-ai-v3`): emergency gate, injection and PII guardrails,
  a supervisor that routes to triage, scheduling, billing or records agents (with up to two
  handoffs), low-confidence clarifying questions, shared conversation memory
  (`ai_conversation_state`), 15 OKF policy files (`get_policy`), and knowledge search that
  re-ranks 20 candidates to 5 with citations. Production uses v3 (`VITE_AI_FUNCTION`).
- **Email reminders** through Resend with retries, quiet hours and opt-out, plus a signed
  delivery-status webhook.
- **Google Calendar** sync on confirm, reschedule and cancel.
- **Recall campaigns** (`/campaigns`): segments, preview, send, daily allowance, unsubscribe
  links, frequency cap and results with 14-day bookings.
- **AI metrics** (`/metrics`, receptionists): v2 vs v3 latency, tokens, fallbacks, routes,
  guardrail events and the evaluation scores.
- **Observability and CI:** Sentry for the browser and Edge Functions; GitHub Actions runs the
  type check, unit tests, build and Playwright on every push.
- **Agent evaluation:** `node scripts/agent-eval.mjs --run <id>` runs the scenarios against v2
  and v3 with the E2E test users; `node scripts/agent-eval-report.mjs` writes
  `eval/AGENT_EVAL_REPORT.md`.

## Features

**Roles.** Every user has a `profiles.role`: `patient`, `doctor`, or `receptionist`. New sign-ups
are patients; a receptionist can promote them. Sign-in uses Supabase Auth (email/password or
Google). Demo accounts are shown on the login page.

- **Patient:** book appointments, see appointments, prescriptions, and bills, join the waitlist,
  accept waitlist offers.
- **Doctor:** schedule, patient records, consultation view (diagnosis, prescription, notes,
  complete visit).
- **Receptionist:** confirm, reschedule, and cancel appointments, manage doctors and patients,
  billing, no-show follow-ups, reports.

**Booking.** Appointments start as `requested`, are `confirmed` by a receptionist, and become
`completed` after the consultation. A partial unique index blocks double booking of the same
doctor, date, and slot. `get_taken_slots` exposes taken times without revealing who booked them.

**Automations** (`20260929010000_automations.sql`):

- pg_cron job `clinic-automations` runs `run_clinic_automations()` every 15 minutes. It sends
  24-hour reminders, flags no-shows (confirmed visits not completed 1 hour after start) for
  receptionist follow-up, and expires unanswered waitlist offers.
- Trigger `appointment_slot_freed` runs when an appointment is cancelled or moved. It calls
  `offer_slot`, which offers the free slot to the oldest waiting patient for 120 minutes. Declined
  or expired offers pass to the next patient.
- The UI shows these through the notification bell and the waitlist and follow-up panels.

**AI assistant** (`/ai`, Edge Function `carebridge-ai-v2`):

- Verifies the user's JWT, loads the role, and queries Supabase with the user's JWT, so Row Level
  Security applies to every tool.
- Rate limits: 30 messages per minute, 1,000 per day. History: last 16 messages.
- Tool loop: at most 4 rounds and 6 tool calls per round, 120 s total budget.
- Read tools per role (`get_my_appointments`, `get_my_schedule`, `search_patients`, and others)
  plus `search_knowledge` for the RAG knowledge base.
- Write actions are never run directly. The model calls a `propose_*` tool, the chat shows a card,
  and the action runs only after the user presses Confirm (`ai_pending_actions`, claimed once).
- Models are reached through the LiteLLM gateway (`carebridge-liteLLM`) with the model group
  `carebridge-agent`; the gateway handles Gemini retries and OpenRouter fallbacks. The function
  records which model group answered in the turn metadata.
- Safety rules: guidance only, not diagnosis; answers knowledge questions only from retrieved
  records; never names people from those records; never gives doses; points to 999 for
  emergencies.

**RAG search** (`20260930000000_rag_documents.sql`, `20260930000200_rag_keyword_fallback.sql`,
`carebridge-ai-v2/tools-knowledge.ts`):

- Table `rag_documents` (pgvector 768 dimensions, full-text, trigram). The corpus and upload
  script live in `carebridge-rag`.
- `match_rag_documents` merges semantic (cosine at least 0.55), full-text, and fuzzy (trigram at
  least 0.6) results with reciprocal rank fusion. If embedding fails, keyword matches still work.
- Signed-in users can read only visible, non-noise rows. Only the service role can write.
- `search_knowledge` embeds the question, calls the RPC (top 5), and anonymises names before the
  model sees the text.

## Metrics

Assessment 3 results (agent task success, search, no-show model) are in
[`docs/assessment-3/ASSESSMENT_3_REPORT.md`](docs/assessment-3/ASSESSMENT_3_REPORT.md). Tests on 8 October 2026: 464 Vitest tests and
8 Playwright end-to-end tests pass.

Assessment 2 results (1 October 2026):

- Tests: 209 Vitest tests and 10 Playwright end-to-end tests pass.
- RAG retrieval (hybrid search, clean index, top 5): hit rate 1.00 on matching queries, 0.96 on
  edge queries, 0.97 on typo-and-junk queries; out-of-scope questions return nothing (5 of 5).
  With 300 noise rows included, noisy-query hit rate drops to 0.47, which is why noise rows are
  flagged and hidden. Details: `carebridge-rag/eval/RAG_EVAL_REPORT.md`.
- Specialization from symptoms (Track 4): 100% on held-out visit notes and 79.2% on hand-written
  descriptions (TF-IDF + logistic regression); 89.6% on hand-written descriptions with Gemini
  zero-shot. Details: `carebridge-rag/eval/CLASSIFICATION_REPORT.md`.

## Local development

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Create `.env.local` (gitignored):

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
VITE_AI_FUNCTION=carebridge-ai-v3
VITE_SENTRY_DSN=<optional browser DSN>
```

`VITE_AI_FUNCTION` selects the Edge Function the chat calls (`carebridge-ai-v3` in production,
`carebridge-ai-v2` for the baseline). Without it, the app uses the older `carebridge-ai` function.

## Tests

| Command | What it runs |
|---|---|
| `npm test` | Vitest: unit tests (`tests/unit`) and Edge Function tests (`tests/edge`) |
| `npm run test:coverage` | Vitest with a coverage report |
| `npm run test:e2e` | Playwright end-to-end tests (`tests/e2e`: login, booking) |

The Edge Function tests run the Deno code under Vitest with an in-memory database
(`tests/helpers/memory-db.ts`) and a mocked gateway, so they need no network or secrets.

## Database migrations

Migrations in `supabase/migrations/` build on the Assessment 1 schema (profiles, doctors,
appointments, prescriptions, bills):

| Migration | Purpose |
|---|---|
| `20260921000000_prevent_active_appointment_slot_conflicts` | Unique active slot per doctor |
| `20260921010000_promote_patient_to_doctor`, `20260923000000_promote_patient_to_receptionist` | Role promotion RPCs |
| `20260922000000_add_ai_conversations` | Chat conversations and messages |
| `20260928000000_ai_v2_turns` | Turn saving and pending-action RPCs for AI V2 |
| `20260928010000_get_taken_slots` | Taken slots without patient identity |
| `20260928020000_ai_v2_actions` | RLS hardening, patient reschedule, complete consultation |
| `20260929000000_normalize_days_and_slots` | `Mon`..`Sun` days, `09:00 AM` slots |
| `20260929010000_automations` | Notifications, reminders, no-shows, waitlist, pg_cron job |
| `20260930000000_rag_documents`, `..._source_idx`, `20260930000200_rag_keyword_fallback` | RAG table, indexes, RLS, hybrid search |
| `20261002000000_get_taken_slots` | Taken slots for a date range |
| `20261005000000_rag_gte_small`, `20261005010000_rag_search_use_indexes` | gte-small embedding column and faster search at 20,000+ rows |
| `20261005020000_advisor_fixes` | Supabase advisor fixes (`docs/assessment-3/supabase-advisors.md`) |
| `20261006000000_message_outbox`, `..._dispatcher_timeout` | Email outbox, delivery events, dispatcher cron |
| `20261006010000_recall_segments`, `20261006020000_campaigns` | Recall segments, campaigns, opt-outs |
| `20261006040000_calendar_sync` | Google Calendar job queue and cron |
| `20261007010000_ai_conversation_state` | Shared memory for the v3 agents |
| `20261007020000_ai_metrics`, `20261007030000_ai_metrics_skip_eval` | `/metrics` RPC; evaluation conversations left out |

Apply with the Supabase CLI:

```sh
npx supabase db push
```

## Deployment

- **Frontend:** Vercel builds from `main` automatically. Set the `VITE_*` variables in the Vercel
  project.
- **Edge Functions:**

  ```sh
  npx supabase functions deploy carebridge-ai-v3
  npx supabase functions deploy carebridge-ai-v2
  ```

  Supabase secrets (names only): `LITELLM_BASE_URL`, `LITELLM_API_KEY` (the gateway master key),
  optional `CLINIC_TIMEZONE` (default `Asia/Dhaka`), `SENTRY_DSN`, `SENTRY_ENVIRONMENT`;
  for email `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `EMAIL_SANDBOX_TO`,
  `UNSUBSCRIBE_SECRET`, `APP_URL`; for the calendar `GOOGLE_SERVICE_ACCOUNT_JSON`,
  `GOOGLE_CALENDAR_ID`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and the service role key are provided
  by Supabase.

Never commit keys. The browser only ever receives the publishable key.

## Other documents

| Path | Contents |
|---|---|
| `docs/assessment-3/` | `ASSESSMENT_3_REPORT.md` (submission report), `DEMO_SCRIPT.md`, `supabase-advisors.md` (advisor findings before and after), `architecture.mmd` and `.png` |
| `eval/` | Agent evaluation: scenarios, raw results, `AGENT_EVAL_REPORT.md`, `AGENT_EVAL_NOTES.md` |
| `docs/history/` | Assessment 2 working documents: implementation plan, AI v2 phase B report and test notes, the A2 demo submission note, and early AI-written audits (`opinions/`). Kept for reference; parts are out of date. |
| `AGENTS.md` | Instructions for coding agents working in this repository |

The assessment briefs and plans are in `../docs/` in the parent folder.

The original UI was generated with [Lovable](https://lovable.dev) and then connected to Supabase.
