# CareBridge Portal

Clinic appointment and patient management app with an AI assistant, built for SJ Innovation
Assessment 2. Patients book visits, doctors run consultations and write prescriptions,
receptionists confirm appointments and handle billing, and a role-aware AI agent can look things up
and propose actions for the user to confirm.

- Live app: https://carebridge-clinic-flow.vercel.app
- Whole-system overview (architecture and data flows): `../PROJECT_OVERVIEW.md` in the parent
  folder, next to the `carebridge-liteLLM` and `carebridge-rag` repositories.

All patient and doctor data is synthetic.

## What is in this repository

| Path | Contents |
|---|---|
| `src/` | React frontend (TanStack Start and Router, Vite, Tailwind, shadcn/ui) |
| `supabase/migrations/` | Database changes: slot conflicts, role promotion, AI tables, automations, RAG |
| `supabase/functions/carebridge-ai-v2/` | The AI agent Edge Function (Deno) |
| `supabase/functions/carebridge-ai/` | Older direct-Gemini assistant, kept for reference |
| `tests/` | Vitest unit and Edge Function tests, Playwright end-to-end tests |

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
VITE_AI_FUNCTION=carebridge-ai-v2
```

`VITE_AI_FUNCTION` selects the Edge Function the chat calls. Without it, the app uses the older
`carebridge-ai` function.

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

Apply with the Supabase CLI:

```sh
npx supabase db push
```

## Deployment

- **Frontend:** Vercel builds from `main` automatically. Set the three `VITE_*` variables in the
  Vercel project.
- **Edge Function:**

  ```sh
  npx supabase functions deploy carebridge-ai-v2
  ```

  Supabase secrets it needs: `LITELLM_BASE_URL`, `LITELLM_API_KEY` (the gateway master key), and
  optionally `CLINIC_TIMEZONE` (default `Asia/Dhaka`). `SUPABASE_URL` and `SUPABASE_ANON_KEY` are
  provided by Supabase.

Never commit keys. The browser only ever receives the publishable key.

## Other documents

- `project_description_update.md`: the Assessment 2 brief.
- `IMPLEMENTATION_PLAN.md`, `CAREBRIDGE_AI_V2_PHASE_B_REPORT.md`, `CAREBRIDGE_GATEWAY_CONTEXT.md`:
  design notes and reports from building the AI agent.
- `AGENTS.md`: instructions for coding agents working in this repository.

The original UI was generated with [Lovable](https://lovable.dev) and then connected to Supabase.
