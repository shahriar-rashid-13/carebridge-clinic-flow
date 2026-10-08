# CareBridge Clinic Flow

CareBridge is a role-based clinic operations portal with appointment management, clinical workflows, automated communications, and a guarded multi-agent AI assistant. It was built for the SJ Innovation assessments and runs publicly on Vercel and Supabase.

[Live application](https://carebridge-clinic-flow.vercel.app) · [Complete project report](docs/FINAL_PROJECT_REPORT.md) · [Assessment 2 report](docs/assessment-2/ASSESSMENT_2_REPORT.md) · [Assessment 3 report](docs/assessment-3/ASSESSMENT_3_REPORT.md) · [Project overview](docs/PROJECT_OVERVIEW.md)

![CareBridge architecture](docs/assessment-3/architecture.png)

Architecture sources: [interactive HTML](docs/assessment-3/architecture.html) · [Mermaid](docs/assessment-3/architecture.mmd)

> All patient, doctor, appointment, prescription, and clinic data in the application is synthetic. The only real dataset used by the wider project is a public Kaggle no-show dataset used offline for model evaluation; it is not loaded into the application.

## Repositories

CareBridge is split across three public repositories:

| Repository | Responsibility |
|---|---|
| [carebridge-clinic-flow](https://github.com/shahriar-rashid-13/carebridge-clinic-flow) | This repository: React application, Supabase migrations, Edge Functions, tests, and agent evaluation |
| [carebridge-liteLLM](https://github.com/shahriar-rashid-13/carebridge-liteLLM) | Server-side LiteLLM gateway deployed on Vercel; routes chat, embedding, and evaluation models |
| [carebridge-rag](https://github.com/shahriar-rashid-13/carebridge-rag) | Synthetic knowledge corpus, ingestion tools, retrieval evaluation, and offline no-show model |

## Architecture

The browser runs a React 19 application built with TanStack Start, TanStack Router, Vite, Tailwind CSS, and shadcn/ui. Vercel hosts the frontend. Supabase provides Auth, Postgres, Row Level Security (RLS), pgvector, pg_cron, Vault, and Deno Edge Functions.

The browser communicates only with Supabase. It never receives model-provider keys or calls a model directly. AI requests go to a Supabase Edge Function, which calls the separate LiteLLM gateway over HTTPS. The gateway has no clinic database access or user identity.

Every AI database tool uses a Supabase client created with the caller's JWT. The same RLS policies therefore constrain both the normal UI and the assistant. Slot conflicts, role promotion, waitlist allocation, reminders, and other invariants are also enforced in Postgres rather than only in the client.

### AI versions

- **`carebridge-ai-v3` is the production default configured through `VITE_AI_FUNCTION`.** It is the Assessment 3 multi-agent implementation.
- **`carebridge-ai-v2` remains deployed as the Assessment 2 baseline** for comparative evaluation.
- `carebridge-ai/` contains the older direct-Gemini source retained for reference. It is not the production implementation.
- The UI source falls back to the legacy `carebridge-ai` name if `VITE_AI_FUNCTION` is omitted, so production and local environments should explicitly set `VITE_AI_FUNCTION=carebridge-ai-v3`.

## Product capabilities

### Roles and routes

New accounts are patients. A receptionist can promote an account to doctor or receptionist.

| Role | Routes and capabilities |
|---|---|
| Patient | `/dashboard`, `/book`, `/appointments`, `/prescriptions`, `/profile`, `/ai`; request, cancel, or reschedule appointments, join the waitlist, accept offers, update profile details, and use the assistant |
| Doctor | `/dashboard`, `/schedule`, `/appointments`, `/records`, `/consult/:id`, `/ai`; view assigned patients and schedules, record diagnoses, prescriptions, and notes, and complete consultations |
| Receptionist | `/dashboard`, `/appointments`, `/doctors`, `/patients`, `/billing`, `/reports`, `/campaigns`, `/metrics`, `/ai`; manage appointments, staff, patients, bills, follow-ups, campaigns, reporting, and AI metrics |

There is **no patient billing page**. `/billing` is receptionist-only; patients can ask the role-aware assistant to retrieve their own bills under RLS.

Appointments progress from `requested` to `confirmed`, then to `completed` after consultation. A partial unique database index prevents two active appointments from occupying the same doctor, date, and time slot. `get_taken_slots` reveals unavailable times without exposing patient identity.

### Multi-agent assistant and guardrails

The v3 assistant processes a turn through:

1. A deterministic emergency gate for red-flag phrases.
2. Input length, prompt-injection, and PII-redaction guardrails.
3. A structured supervisor that selects `triage`, `scheduling`, `billing`, or `records`, with a keyword fallback if model routing fails.
4. A low-confidence clarification path below the configured confidence threshold.
5. One specialist plus up to two handoffs for multi-intent requests.
6. Output checks that block medicine doses, raw IDs, tool-call text, and repeated content.

Shared conversation state expires after 24 hours and carries details such as the selected specialization, doctor, date, pending request, and recently listed appointments. Clinic policy answers use 15 reviewed OKF files with citations; general medical and clinic knowledge uses RAG.

The assistant provides guidance rather than diagnosis, does not expose names from retrieved records, does not provide medicine doses, and directs emergencies to 999. Requests are rate-limited to 30 messages per minute and 1,000 per day per user.

### Proposal-confirm write flow

Read tools may run immediately, but the model cannot directly change clinic data. Every write tool creates an `ai_pending_actions` proposal:

1. The Edge Function validates the requested action and stores a pending record.
2. The chat renders a human-readable Confirm/Cancel card.
3. Only an explicit confirmation claims the action once, revalidates it, and executes it with the user's JWT.
4. The result is persisted so retries or double-clicks cannot execute the same action twice.

This applies to booking, cancellation, rescheduling, waitlist actions, consultation completion, appointment confirmation, billing, role promotion, and follow-up resolution.

### RAG knowledge search

Assessment 3 uses **20,758 synthetic records** embedded with **gte-small at 384 dimensions**. Document embeddings are generated locally in `carebridge-rag`; query embeddings run in the Supabase Edge runtime, avoiding an external embedding quota during live searches.

`match_rag_documents` combines vector, full-text, and trigram retrieval. V3 requests 20 candidates, then re-ranks them to 5 with the chat model; if re-ranking times out, the fused retrieval order is used. The gte-small cosine threshold is 0.82. RLS exposes only visible, non-noise rows, and medicine amounts in other patients' records are replaced with `[dose omitted]`.

The older v2 baseline uses the Assessment 2 retrieval path and is retained for comparison. Search methodology and A2-versus-A3 results are documented in the [Assessment 3 report](docs/assessment-3/ASSESSMENT_3_REPORT.md).

### Automations and integrations

- **Clinic automations:** `run_clinic_automations()` runs every 15 minutes through pg_cron. It creates 24-hour reminders, flags possible no-shows one hour after a confirmed appointment begins, and expires unanswered waitlist offers.
- **Waitlist fill:** cancelling or moving an appointment triggers an offer to the oldest eligible waitlist entry. Offers last 120 minutes; declined or expired offers pass to the next patient.
- **Resend email:** reminder and campaign messages enter `message_outbox`. `message-dispatcher` runs every minute, observes 22:00–08:00 Dhaka quiet hours, checks opt-outs, uses idempotency keys, and retries after 1, 5, 15, and 60 minutes.
- **Signed webhook:** `resend-webhook` verifies the Svix signature, deduplicates events, and advances delivery state without allowing late events to regress it.
- **Recall campaigns:** receptionists can preview and send overdue check-up, missed-visit, and follow-up segments from `/campaigns`. Campaigns include a daily allowance, frequency cap, signed unsubscribe links, one-click unsubscribe headers, and 14-day booking conversion metrics.
- **Google Calendar:** confirmed, rescheduled, and cancelled appointments queue idempotent `calendar_jobs`; `calendar-sync` creates, updates, or deletes events in the shared clinic calendar.

## Security and observability

- RLS is enabled across application tables. Patients see their own data, doctors see their assigned patients, and receptionists receive clinic-wide operational access.
- The assistant queries with the caller's JWT, not the service-role key.
- Security-definer RPCs validate role and ownership; anonymous execution is revoked where it is not required.
- Browser and Edge Function errors are reported to Sentry. Events are scrubbed of user identity, request bodies, cookies, query strings, typed text, emails, phone numbers, and UUIDs. Browser tracing samples 10% of page loads; session replay is disabled.
- Assistant turns store structured operational metadata such as route, agents, tools, models, fallback calls, tokens, latency, handoffs, and guardrail events.
- Receptionists can compare v2 and v3 behavior on `/metrics`; evaluation conversations are excluded.
- Detailed Supabase advisor findings are linked from the [Assessment 3 report](docs/assessment-3/ASSESSMENT_3_REPORT.md).

## Local development

### Prerequisites

- Node.js 22
- npm
- A Supabase project containing the base Assessment 1 schema
- Supabase CLI access for database or Edge Function deployment

Install and start the application:

```bash
npm install
npm run dev
```

Create a gitignored `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
VITE_AI_FUNCTION=carebridge-ai-v3
VITE_SENTRY_DSN=<optional-browser-sentry-dsn>
```

Only `VITE_*` values are bundled for the browser. Never place service-role, LiteLLM, Resend, or Google credentials in a `VITE_*` variable.

### Environment variables

#### Frontend

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser-safe Supabase publishable key |
| `VITE_AI_FUNCTION` | Yes for current behavior | Set to `carebridge-ai-v3` in production; use `carebridge-ai-v2` only for baseline testing |
| `VITE_SENTRY_DSN` | No | Enables scrubbed browser Sentry reporting |

#### Edge Functions

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | All database-backed functions | Supplied by Supabase |
| `SUPABASE_ANON_KEY` | `carebridge-ai-v2`, `carebridge-ai-v3` | Supplied by Supabase; combined with the caller JWT so RLS applies |
| `SUPABASE_SERVICE_ROLE_KEY` | dispatcher, webhook, unsubscribe, calendar, embed check | Supplied by Supabase; server-side only |
| `SUPABASE_SECRET_KEYS` | `embed-check` only | Optional JSON object of additional accepted secret keys |
| `LITELLM_BASE_URL` | AI v2/v3 | LiteLLM gateway base URL |
| `LITELLM_API_KEY` | AI v2/v3 | Gateway authentication key |
| `CLINIC_TIMEZONE` | AI v2/v3 | Optional; defaults to `Asia/Dhaka` |
| `SENTRY_DSN` | AI and integration functions | Optional server-side Sentry DSN |
| `SENTRY_ENVIRONMENT` | AI and integration functions | Optional; defaults to `production` |
| `RESEND_API_KEY` | `message-dispatcher` | Resend API key |
| `RESEND_WEBHOOK_SECRET` | `resend-webhook` | Svix signing secret from Resend |
| `EMAIL_FROM` | `message-dispatcher` | Sender identity |
| `EMAIL_SANDBOX_TO` | `message-dispatcher` | Optional sandbox redirect for synthetic recipients |
| `UNSUBSCRIBE_SECRET` | dispatcher and `unsubscribe` | HMAC secret for signed unsubscribe links |
| `APP_URL` | `message-dispatcher` | Public app URL used in email links; code defaults to the live app |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `calendar-sync` | Google service-account JSON |
| `GOOGLE_CALENDAR_ID` | `calendar-sync` | Shared clinic calendar ID |

The database cron jobs also require two Supabase Vault secrets created outside migrations: `project_url` (the Supabase project URL) and `dispatcher_token` (a strong shared secret used in the `x-dispatcher-token` header).

#### E2E and agent evaluation

Copy `.env.test.example` to `.env.test` and set:

```dotenv
E2E_BASE_URL=
E2E_PATIENT_EMAIL=
E2E_PATIENT_PASSWORD=
E2E_DOCTOR_EMAIL=
E2E_DOCTOR_PASSWORD=
E2E_RECEPTIONIST_EMAIL=
E2E_RECEPTIONIST_PASSWORD=
```

`E2E_BASE_URL` is optional. When omitted, Playwright starts the local development server on port 4173. The agent evaluator additionally reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.local`.

## Scripts and tests

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run build:dev` | Build in development mode |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest unit and Edge Function suites |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Run Vitest with V8 coverage |
| `npm run test:e2e` | Run the serial Playwright suite |
| `npm run format` | Format the repository with Prettier |
| `npm run okf:build` | Regenerate the bundled OKF policy module |

The current Assessment 3 release reports 464 Vitest tests and 8 Playwright tests. Edge Function tests use an in-memory database and mocked gateway, so `npm test` needs no network or production secrets. E2E tests use real test accounts and mutate then clean up live appointment data, so they run serially.

Agent evaluation commands:

```bash
# Run or resume labelled scenarios against v2 and v3
node scripts/agent-eval.mjs --run <run-id>

# Restrict versions or scenarios
node scripts/agent-eval.mjs --run <run-id> --versions v2,v3 --only <id1,id2>

# Re-score saved output without model calls
node scripts/agent-eval.mjs --rescore <run-id>

# Build the comparative report from saved runs
node scripts/agent-eval-report.mjs --v2 <run1,run2,run3> --v3 <run1,run2,run3>
```

The evaluator never confirms proposals, so it does not change clinic records.

## Database and migrations

Migrations in `supabase/migrations/` extend the base Assessment 1 schema. Apply them in timestamp order:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Major migration groups:

| Area | Migrations |
|---|---|
| Booking and roles | Active-slot uniqueness, doctor/receptionist promotion, normalized working days and slots, privacy-preserving taken-slot RPCs |
| AI v2 | Conversations, messages, turn metadata, pending actions, action RPC hardening |
| Automations | Notifications, no-show follow-ups, waitlists, offers, triggers, and the 15-minute pg_cron job |
| RAG | `rag_documents`, source/full-text/trigram/vector indexes, keyword fallback, 384-d `embedding_gte`, and indexed search |
| Assessment 3 integrations | Message outbox/events, dispatcher timeout handling, recall segments/campaigns, calendar queue and cron |
| AI v3 and metrics | Shared conversation state, metrics RPCs, evaluation filtering |
| Hardening | Advisor fixes, foreign-key indexes, policy optimization, revoked function access, and duplicate-index removal |

Migrations assume the original Assessment 1 tables—such as `profiles`, `doctors`, `appointments`, `prescriptions`, and `bills`—already exist. They also enable required extensions such as pgvector, pg_cron, pg_net, and Vault-dependent scheduling where applicable.

## Edge Function deployment

Set the required Supabase secrets first, then deploy the current functions:

```bash
# JWT-protected user-facing AI functions
npx supabase functions deploy carebridge-ai-v3
npx supabase functions deploy carebridge-ai-v2

# Internal cron workers: Supabase JWT verification is disabled because pg_cron
# authenticates with the private x-dispatcher-token checked by each function
npx supabase functions deploy message-dispatcher --no-verify-jwt
npx supabase functions deploy calendar-sync --no-verify-jwt

# Public provider/token endpoints: each performs its own verification
npx supabase functions deploy resend-webhook --no-verify-jwt
npx supabase functions deploy unsubscribe --no-verify-jwt
```

Do not add `--no-verify-jwt` to the AI deployments: they require a signed-in user's JWT and then use it for RLS-scoped tool calls.

`resend-webhook` cannot present a Supabase login and instead requires a valid Svix signature. `unsubscribe` requires a valid signed, expiring unsubscribe token. The cron workers accept either the Vault-backed dispatcher token or a service-role bearer token and reject other callers.

`embed-check` is a temporary diagnostic function, not a persistent production service:

```bash
npx supabase functions deploy embed-check --no-verify-jwt
# Run the cross-runtime embedding check, then remove the function:
npx supabase functions delete embed-check
```

It accepts only a service-role key or a key listed in `SUPABASE_SECRET_KEYS`.

The deployable function set in this repository is therefore:

- `carebridge-ai-v3` — production multi-agent assistant
- `carebridge-ai-v2` — Assessment 2 baseline
- `message-dispatcher` — Resend outbox worker
- `resend-webhook` — signed delivery event receiver
- `unsubscribe` — signed public opt-out endpoint
- `calendar-sync` — Google Calendar queue worker
- `embed-check` — temporary gte-small verification utility

## CI and deployment behavior

[GitHub Actions CI](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/actions/workflows/ci.yml) uses Node.js 22.

- Every pull request and every push to `main` runs `npm ci`, TypeScript checking, all Vitest tests, and the production build.
- Playwright E2E runs **only on pushes to `main`**, after the first job passes. It does not run on pull requests because it books and cancels appointments in the live test database.
- E2E is serialized across workflow runs. Failure artifacts retain the Playwright report and test results for seven days.
- Vercel deploys the frontend from `main`. Database migrations and Edge Functions are deployed separately with the Supabase CLI.

CI secrets comprise the two frontend Supabase values and the six role-specific E2E credential variables listed above.

## Repository map

| Path | Contents |
|---|---|
| `src/routes/` | TanStack Router file-based application routes |
| `src/components/clinic/` | Role-aware shell, AI panel, notifications, and workflow UI |
| `src/lib/` | Auth, clinic data access, Supabase client, metrics, campaigns, and Sentry |
| `supabase/migrations/` | Database changes, RLS, RPCs, triggers, queues, and cron schedules |
| `supabase/functions/carebridge-ai-v3/` | Production supervisor, specialists, guardrails, shared state, RAG, and OKF policies |
| `supabase/functions/carebridge-ai-v2/` | Assessment 2 single-agent baseline and shared gateway/Sentry utilities |
| `supabase/functions/message-dispatcher/` | Resend outbox processing |
| `supabase/functions/resend-webhook/` | Signed delivery events |
| `supabase/functions/unsubscribe/` | Signed opt-out endpoint |
| `supabase/functions/calendar-sync/` | Google Calendar worker |
| `tests/unit/` | React, state, utility, campaign, metrics, and evaluation tests |
| `tests/edge/` | AI, guardrail, RAG, email, webhook, unsubscribe, and calendar tests |
| `tests/e2e/` | Playwright login and booking flows |
| `eval/` | Labelled agent scenarios, saved results, and comparative report |
| `docs/` | Project overview, assessment reports, architecture, demo, and advisor notes |

## Known limitations

- Chat and re-ranking use free-tier models. The LiteLLM fallback chain reduces outages but cannot eliminate provider quota exhaustion or variable latency.
- V3 adds a supervisor call and is therefore slower than v2; production re-ranking may fall back to fused search order after its timeout.
- gte-small is economical and runs in the Edge runtime, but evaluation shows it is weaker than the earlier Gemini embeddings on very short or noisy queries.
- The supervisor can occasionally route a multi-part request to only one specialist.
- Resend sandbox mode redirects messages for synthetic patients to the configured sandbox recipient until a sending domain is verified.
- The no-show model is an offline evaluation trained on a 2016 Brazilian public dataset. It is not used for live clinical decisions and would require retraining before real deployment.
- This repository contains migrations layered on the Assessment 1 database rather than a fresh bootstrap migration for the complete base schema.

## Further documentation

- [Complete project report](docs/FINAL_PROJECT_REPORT.md) — comprehensive reviewer handoff across all three repositories
- [Project overview](docs/PROJECT_OVERVIEW.md) — system boundaries, data flows, and design decisions
- [Assessment 2 report](docs/assessment-2/ASSESSMENT_2_REPORT.md) — v2 assistant, initial automations, RAG baseline, and test evidence
- [Assessment 3 report](docs/assessment-3/ASSESSMENT_3_REPORT.md) — integrations, v3 evaluation, model metrics, observability, security, and known limits
- [Architecture HTML](docs/assessment-3/architecture.html) and [Mermaid source](docs/assessment-3/architecture.mmd)
