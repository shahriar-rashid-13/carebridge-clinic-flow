# CareBridge Final Project Report

**SJ Innovation intern assignment · Assessments 1–3 · Shahriar Rashid · 16 September–9 October 2026**

CareBridge is a role-based clinic operations system for patients, doctors, and receptionists. It combines appointment and consultation workflows, billing, automated reminders and waitlists, recall campaigns, email and calendar integrations, a guarded multi-agent assistant, a synthetic retrieval corpus, and offline evaluation. The implementation is split across three public repositories and deployed through Vercel and Supabase.

> **Data statement:** all patient, doctor, appointment, prescription, billing, and clinic data in CareBridge is synthetic. The only real-world dataset is the public, anonymised Kaggle Medical Appointment No Shows dataset. It is used offline for model evaluation and is never loaded into the application or Supabase.

| Resource | Public link |
|---|---|
| Live application | [https://carebridge-clinic-flow.vercel.app](https://carebridge-clinic-flow.vercel.app) |
| Clinic application repository | [https://github.com/shahriar-rashid-13/carebridge-clinic-flow](https://github.com/shahriar-rashid-13/carebridge-clinic-flow) |
| RAG and evaluation repository | [https://github.com/shahriar-rashid-13/carebridge-rag](https://github.com/shahriar-rashid-13/carebridge-rag) |
| LiteLLM gateway repository | [https://github.com/shahriar-rashid-13/carebridge-liteLLM](https://github.com/shahriar-rashid-13/carebridge-liteLLM) |
| Server-to-server model gateway | [https://carebridge-lite-llm.vercel.app](https://carebridge-lite-llm.vercel.app) |
| Assessment 2 report | [https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-2/ASSESSMENT_2_REPORT.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-2/ASSESSMENT_2_REPORT.md) |
| Assessment 3 report | [https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-3/ASSESSMENT_3_REPORT.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-3/ASSESSMENT_3_REPORT.md) |
| System overview | [https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/PROJECT_OVERVIEW.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/PROJECT_OVERVIEW.md) |

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Assessment timeline and deliverables](#2-assessment-timeline-and-deliverables)
3. [Repository responsibilities](#3-repository-responsibilities)
4. [System architecture and trust boundaries](#4-system-architecture-and-trust-boundaries)
5. [Technology stack](#5-technology-stack)
6. [Roles, routes, and major workflows](#6-roles-routes-and-major-workflows)
7. [Database model and migration history](#7-database-model-and-migration-history)
8. [RLS, authorization, and security](#8-rls-authorization-and-security)
9. [Booking, consultation, prescriptions, and billing](#9-booking-consultation-prescriptions-and-billing)
10. [Automations, waitlist, and follow-ups](#10-automations-waitlist-and-follow-ups)
11. [AI assistant: v2 and production v3](#11-ai-assistant-v2-and-production-v3)
12. [Agents, tools, confirmation, memory, and guardrails](#12-agents-tools-confirmation-memory-and-guardrails)
13. [OKF policies and RAG](#13-okf-policies-and-rag)
14. [Corpus generation, validation, embeddings, upload, and search](#14-corpus-generation-validation-embeddings-upload-and-search)
15. [LiteLLM models, timeouts, and fallbacks](#15-litellm-models-timeouts-and-fallbacks)
16. [Resend, recall campaigns, and unsubscribe](#16-resend-recall-campaigns-and-unsubscribe)
17. [Google Calendar integration](#17-google-calendar-integration)
18. [Observability and operational metrics](#18-observability-and-operational-metrics)
19. [Evaluation design and measured results](#19-evaluation-design-and-measured-results)
20. [Testing and CI](#20-testing-and-ci)
21. [Deployment, configuration, and environment variables](#21-deployment-configuration-and-environment-variables)
22. [Repository maps](#22-repository-maps)
23. [Local development and reproduction](#23-local-development-and-reproduction)
24. [Design decisions](#24-design-decisions)
25. [Known limitations and future work](#25-known-limitations-and-future-work)
26. [Reviewer handoff links and demo accounts](#26-reviewer-handoff-links-and-demo-accounts)

## 1. Executive summary

CareBridge progressed from a working clinic portal in Assessment 1, through a tool-using assistant and automated operations in Assessment 2, to an integrated and measured production-oriented system in Assessment 3. Its core design principle is that neither the browser nor a language model is trusted with provider secrets or unrestricted database access.

The browser communicates with Supabase. User-facing AI requests enter a JWT-protected Supabase Edge Function. That function performs deterministic safety checks, routes the request, and executes tools with a Supabase client carrying the signed-in user's JWT. The same Row Level Security (RLS) policies therefore constrain the UI and the assistant. The separate LiteLLM gateway has provider credentials but no clinic identity, database connection, or business tools.

The current production assistant is **`carebridge-ai-v3`**. It uses a structured supervisor, four specialist agents, deterministic emergency handling, PII redaction, prompt-injection checks, reviewed policy files, hybrid retrieval, proposal-before-write actions, and 24-hour conversation state. The Assessment 2 single-agent **`carebridge-ai-v2`** remains deployed only as a comparison baseline.

The final knowledge corpus contains **20,758 validated synthetic records**: 11,028 visit notes, 9,500 prescriptions, and 230 FAQs. Every record has a local **Supabase/gte-small 384-dimensional embedding**. Production retrieval combines vector, full-text, and trigram rankings, requests 20 candidates, and model-reranks to five with a deterministic fallback to fused order.

The final application test inventory is **464 Vitest unit and Edge Function tests plus 8 Playwright end-to-end tests**. GitHub Actions runs type checking, Vitest, and a production build on pull requests and pushes to `main`; serialized Playwright tests run only after successful pushes to `main` because they mutate and clean up live test appointments.

## 2. Assessment timeline and deliverables

| Assessment | Dates | Objective | Delivered outcome |
|---|---|---|---|
| Assessment 1 | 16–23 Sep 2026 | Build a functional clinic application with three roles | Patient booking, receptionist operations, doctor consultations, prescriptions, billing, Supabase Auth, role-aware UI, RLS, Vercel deployment |
| Assessment 2 | 24 Sep–1 Oct 2026 | Add AI, automations, retrieval, classification, and tests | Single tool-calling v2 agent; 16 read and 14 proposal tools; confirmation before mutation; scheduled reminders/no-show follow-up; event-driven waitlist; 5,110-record synthetic corpus; A2 retrieval and specialization evaluation; 209 Vitest and 10 Playwright tests |
| Assessment 3 | 2–9 Oct 2026 | Integrate external services, improve intelligence, evaluate against A2, and harden operations | Production multi-agent v3; emergency and PII guardrails; 15 OKF policy files; Resend, signed webhooks, unsubscribe, recall campaigns, Google Calendar; 20,758-record gte-small search; no-show study; Sentry and metrics; advisor fixes; CI; 464 Vitest and 8 Playwright tests |

The authoritative assessment submissions are the [Assessment 2 report](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-2/ASSESSMENT_2_REPORT.md) and [Assessment 3 report](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-3/ASSESSMENT_3_REPORT.md). Assessment 3 tags exist in all three repositories.

## 3. Repository responsibilities

| Repository | Responsibility | Runtime |
|---|---|---|
| [`carebridge-clinic-flow`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow) | React application; role-based routes; Supabase client; database migrations; RLS, RPCs, triggers, cron, queues; v2/v3 AI Edge Functions; email/calendar Edge Functions; tests; agent evaluation; architecture and assessment documentation | Browser on Vercel; Postgres/Auth/Edge Functions on Supabase |
| [`carebridge-rag`](https://github.com/shahriar-rashid-13/carebridge-rag) | Deterministic synthetic manifest; LLM/scripted corpus generation; validation and build; Gemini and gte-small embedding pipelines; upload tools; retrieval, answer, policy, and classification evaluations; offline no-show notebook/model | Local Node.js and Python; trusted upload/evaluation access to Supabase and LiteLLM |
| [`carebridge-liteLLM`](https://github.com/shahriar-rashid-13/carebridge-liteLLM) | OpenAI-compatible server-side gateway; stable model aliases; provider credentials; explicit timeouts and fallback order; gateway configuration checks and live diagnostics | Python ASGI/LiteLLM on Vercel |

The split is intentional. Application authorization and business rules stay with Supabase; model routing stays in the gateway; high-privilege corpus generation and evaluation stay offline.

## 4. System architecture and trust boundaries

![CareBridge Assessment 3 architecture](https://raw.githubusercontent.com/shahriar-rashid-13/carebridge-clinic-flow/main/docs/assessment-3/architecture.png)

Architecture sources: [PNG](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-3/architecture.png), [Mermaid](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-3/architecture.mmd), and [interactive HTML](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-3/architecture.html).

### 4.1 Runtime flow

1. A user authenticates through Supabase Auth. The frontend reads the user's `profiles.role`.
2. Normal UI operations use the Supabase browser client and are filtered by RLS.
3. AI requests invoke `carebridge-ai-v3` with the user's JWT.
4. The Edge Function validates authentication and role, applies limits and guardrails, then routes the turn.
5. Database tools use the anon key plus the caller JWT. They do not use service-role access.
6. Model calls leave Supabase through the authenticated LiteLLM gateway.
7. LiteLLM selects Gemini or an OpenRouter fallback. It receives prompts and tool schemas, not database credentials.
8. Integrations use outbox/queue tables. Private cron workers use a Vault-backed dispatcher token or service-role bearer token; Resend's public webhook uses Svix signature verification; unsubscribe links use signed expiring tokens.
9. Offline RAG scripts use a service-role key only for controlled ingestion and evaluation.

### 4.2 Trust boundaries

| Boundary | Trusted material | Explicitly unavailable |
|---|---|---|
| Browser | Browser-safe Supabase URL/publishable key and the signed-in session | Service-role key, model-provider keys, Resend key, Google service-account key, LiteLLM master key |
| Supabase user-facing AI function | Caller JWT, anon key, server-only gateway credentials | Unrestricted user data; RLS still applies |
| Supabase integration workers | Service-role access or private dispatcher token and integration secrets | Browser access; workers reject unauthenticated callers |
| LiteLLM gateway | Provider keys and gateway master key | Supabase credentials, clinic database, user role, SQL, clinic tools |
| Resend webhook | Public endpoint plus Svix signature secret | Supabase login; invalid, duplicate, or stale events are rejected/contained |
| Offline RAG tooling | Explicit local service-role and gateway configuration | No runtime browser exposure; generated embeddings and secrets are gitignored |

Business invariants are enforced in Postgres where possible. A partial unique index prevents active double booking; security-definer RPCs recheck role and ownership; triggers enqueue waitlist, email, and calendar work; unique keys and row claiming make retries idempotent.

## 5. Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, TanStack Start, TanStack Router, Vite 8, Tailwind CSS 4, shadcn/Radix UI, TanStack Query, React Hook Form, Zod, Recharts |
| Hosting | Vercel for the frontend and LiteLLM ASGI deployment |
| Backend | Supabase Auth, Postgres 17, PostgREST, RLS, RPCs, Realtime, Deno Edge Functions |
| Database extensions | pgvector, pg_cron, pg_net, pg_trgm, Supabase Vault |
| AI gateway | LiteLLM 1.103.0, OpenAI-compatible chat/embedding APIs |
| Application models | Gemini 3.1 Flash Lite primary/retry; Nvidia Nemotron and Qwen OpenRouter fallbacks |
| Retrieval | Gemini embedding-001 768d for the A2 baseline; Supabase/gte-small 384d for production A3 |
| Evaluation model | Gemini 3.5 Flash through the separate `carebridge-judge` alias |
| Email/calendar | Resend, Svix-signed webhook verification, Google Calendar service-account API |
| Observability | Sentry browser and Edge reporting, structured AI message metadata, receptionist metrics page |
| Tests and analysis | Vitest, Testing Library, Playwright, scikit-learn, Transformers.js, Jupyter |
| CI | GitHub Actions with Node.js 22; gateway config workflow with Python 3.12 |

## 6. Roles, routes, and major workflows

New accounts are patients. A receptionist may promote an account to doctor or receptionist through guarded RPCs or a confirmed AI proposal.

| Role | Main routes | Major capabilities |
|---|---|---|
| Patient | `/dashboard`, `/book`, `/appointments`, `/prescriptions`, `/profile`, `/ai` | Request, cancel, and reschedule own appointments; view unavailable slots without seeing other patients; join/leave waitlists; accept/decline timed offers; view own prescriptions and notifications; update profile; retrieve own bills through the assistant |
| Doctor | `/dashboard`, `/schedule`, `/appointments`, `/records`, `/consult/:id`, `/ai` | View assigned schedule and patients; inspect permitted patient history; record diagnosis, notes, and prescription; complete a consultation |
| Receptionist | `/dashboard`, `/appointments`, `/doctors`, `/patients`, `/billing`, `/reports`, `/campaigns`, `/metrics`, `/ai` | Confirm/reschedule/cancel appointments; manage staff roles and doctors; create and settle bills; resolve no-show follow-ups; preview/send recall campaigns; inspect delivery and AI operational metrics |

There is intentionally no patient `/billing` page. Billing administration is receptionist-only; a patient can ask the assistant for their own bills, and RLS limits the answer to that patient.

### End-to-end clinic lifecycle

1. The patient selects an active doctor, date, and normalized time slot.
2. The application inserts a `requested` appointment.
3. Reception confirms it; confirmation queues an idempotent calendar upsert.
4. A 24-hour reminder becomes an in-app notification and email outbox item.
5. The doctor opens the consultation, records clinical details, adds a prescription, and completes the visit.
6. Reception creates the bill and later marks it paid.
7. If the confirmed appointment remains incomplete after its start, an operational follow-up is created for reception.

## 7. Database model and migration history

### 7.1 Principal data groups

| Domain | Main tables/data |
|---|---|
| Identity and clinic | `profiles`, `doctors` |
| Care delivery | `appointments`, `prescriptions`, `bills` |
| Automation | `notifications`, `appointment_followups`, `waitlist`, `waitlist_offers` |
| AI | `ai_conversations`, `ai_messages`, `ai_pending_actions`, `ai_conversation_state` |
| Knowledge | `rag_documents`, 768d `embedding`, 384d `embedding_gte`, generated search text and metadata |
| Messaging | `message_outbox`, `message_events` |
| Campaigns | `campaigns`, `campaign_recipients`, `communication_opt_outs`, profile opt-out fields |
| Calendar | `calendar_jobs` |

The repository's migrations extend the Assessment 1 schema; they are not a clean bootstrap for the original `profiles`, `doctors`, `appointments`, `prescriptions`, and `bills` tables.

### 7.2 Migration chronology

All migrations are public at [the clinic repository migration directory](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/supabase/migrations).

| Migration | Purpose |
|---|---|
| [`20260921000000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260921000000_prevent_active_appointment_slot_conflicts.sql) | Partial unique index preventing two non-cancelled appointments for the same doctor/date/slot |
| [`20260921010000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260921010000_promote_patient_to_doctor.sql) | Receptionist-controlled promotion to doctor |
| [`20260922000000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260922000000_add_ai_conversations.sql) | Initial AI conversations/messages storage |
| [`20260923000000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260923000000_promote_patient_to_receptionist.sql) | Receptionist promotion RPC |
| [`20260928000000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260928000000_ai_v2_turns.sql) | Atomic AI turn persistence and metadata |
| [`20260928010000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260928010000_get_taken_slots.sql) | Privacy-preserving unavailable-slot lookup |
| [`20260928020000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260928020000_ai_v2_actions.sql) | Pending actions, claim-once execution, and action completion |
| [`20260929000000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260929000000_normalize_days_and_slots.sql) | Canonical weekday and 12-hour slot formats |
| [`20260929010000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260929010000_automations.sql) | Notifications, no-show follow-ups, waitlists/offers, slot-freed trigger, 15-minute automation cron |
| [`20260930000000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260930000000_rag_documents.sql) | RAG table, pgvector/full-text/trigram search, indexes, RLS |
| [`20260930000100`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260930000100_rag_documents_source_idx.sql) | Source-oriented RAG indexing |
| [`20260930000200`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20260930000200_rag_keyword_fallback.sql) | Keyword search when embeddings are unavailable |
| [`20261002000000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261002000000_get_taken_slots.sql) | Hardened/current taken-slot behavior |
| [`20261005000000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261005000000_rag_gte_small.sql) | 384d gte-small column, HNSW index, dual-model hybrid RPC |
| [`20261005010000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261005010000_rag_search_use_indexes.sql) | Search rewrite to preserve index use |
| [`20261005020000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261005020000_advisor_fixes.sql) | Search-path hardening, grants, policy optimization, foreign-key indexes, duplicate cleanup |
| [`20261006000000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261006000000_message_outbox.sql) | Email outbox/events, reminder trigger, quiet-hour worker claims, cron dispatch |
| [`20261006010000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261006010000_recall_segments.sql) | Overdue check-up, missed-visit, and follow-up segments |
| [`20261006020000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261006020000_campaigns.sql) | Campaign preview/send/results, daily quota, seven-day cap, opt-outs, 14-day conversions |
| [`20261006030000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261006030000_dispatcher_timeout.sql) | Dispatcher timeout/recovery behavior |
| [`20261006040000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261006040000_calendar_sync.sql) | Calendar queue, triggers, claim RPC, minute cron |
| [`20261007010000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261007010000_ai_conversation_state.sql) | RLS-protected per-conversation v3 memory |
| [`20261007020000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261007020000_ai_metrics.sql) | Aggregated AI operational metrics |
| [`20261007030000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261007030000_ai_metrics_skip_eval.sql) | Excludes tagged evaluation conversations from production metrics |
| [`20261008000000`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/supabase/migrations/20261008000000_drop_duplicate_appointment_index.sql) | Removes a duplicate appointment index |

## 8. RLS, authorization, and security

- RLS is enabled on application tables. Patients see their own rows; doctors see their schedule and assigned patients; receptionists receive the operational scope needed for clinic administration.
- AI tools use the caller's JWT. The service-role key is not used for patient, doctor, or receptionist tool execution.
- `get_taken_slots` returns occupied times without exposing the other patient's identity.
- High-risk writes use security-definer RPCs that validate `auth.uid()`, role, ownership, state, and arguments. Public/anonymous execution is revoked unless a function is intentionally public and self-verifying.
- Pending AI actions are claimed once and revalidated before execution, limiting replay and double-click effects.
- The active-slot unique index is a database-level race-condition control rather than a UI-only availability check.
- RAG users can read only visible, non-noise records and cannot write corpus rows.
- Integration queues are receptionist-readable where operationally useful; raw message events have no authenticated-user policy.
- Secrets live in Supabase secrets/Vault, Vercel environment variables, GitHub Actions secrets, or ignored local environment files. Only `VITE_*` values enter the browser bundle.

The documented advisor pass reduced findings from 27 to 18 security and 33 to 20 performance findings before the later Assessment 3 additions. The final post-feature list includes expected security-definer RPC findings, a Pro-plan leaked-password-protection notice, and low-traffic unused-index/policy findings. These are documented in the [Supabase advisor report](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-3/supabase-advisors.md), not represented as zero-risk claims.

## 9. Booking, consultation, prescriptions, and billing

### Booking

Availability derives from each active doctor's normalized working days and slots minus `get_taken_slots`. New bookings are `requested`; receptionists move them to `confirmed`. Cancellation frees a slot and triggers waitlist allocation. Rescheduling changes date/time and likewise offers the old slot.

### Consultation and records

A doctor can open only permitted appointments/patient records. Completing a consultation stores diagnosis, notes, and prescription data and changes the appointment to `completed`. The assistant's doctor tools support schedule, patient summary/history, and a confirmed consultation-completion proposal; they do not grant broader access than the doctor's RLS scope.

### Billing

Receptionists inspect completed, unbilled visits, create bills, list bills, and mark them paid. Patients can retrieve only their bills through a role-aware read tool. Billing mutations follow the same proposal-confirm flow as scheduling and role promotion.

## 10. Automations, waitlist, and follow-ups

`run_clinic_automations()` executes every 15 minutes in the `Asia/Dhaka` clinic timezone:

- creates one 24-hour reminder notification for each due confirmed appointment;
- flags a confirmed appointment as a possible no-show when it began more than one hour ago and less than seven days ago but remains incomplete;
- creates receptionist notifications for newly flagged follow-ups;
- expires pending waitlist offers and passes the slot to the next eligible patient;
- expires waiting entries whose requested date has passed.

The waitlist is event-driven. When an active appointment is cancelled or moved, `appointment_slot_freed` calls `offer_slot()`. Selection favors an exact requested slot and otherwise the oldest eligible entry. `FOR UPDATE SKIP LOCKED`, a unique pending-offer index, and the active appointment constraint reduce concurrency conflicts. Offers last **120 minutes**. Accepting creates a requested appointment; declining or expiry returns the entry and advances the slot.

## 11. AI assistant: v2 and production v3

### 11.1 Assessment 2 v2 baseline

`carebridge-ai-v2` is a single role-aware agent. It authenticates the caller, enforces 30 messages per minute and 1,000 per day, loads bounded recent history, and runs a multi-round tool loop. It exposes 16 read tools and 14 write-proposal tools. V2 remains deployed for comparative evaluation, not as the production default.

### 11.2 Assessment 3 v3 production turn

Production is explicitly configured with `VITE_AI_FUNCTION=carebridge-ai-v3`.

1. Sanitize input and enforce a 4,000-character limit.
2. Match red-flag phrases against a deterministic emergency gate. Matching requests receive approved guidance without a model call.
3. Detect prompt-injection patterns and redact emails, Bangladeshi/international phone numbers, national IDs, and context-qualified dates of birth.
4. Ask the supervisor for strict JSON: primary agent, up to two handoffs, `okf|rag|none`, optional policy id, confidence, and optional clarification.
5. Validate the JSON; retry once on malformed output; then use a deterministic keyword router if both attempts fail.
6. Below confidence 0.6, ask one bounded clarifying question instead of guessing.
7. Run the selected specialist and at most two handoffs with role-appropriate tools.
8. Use an approved OKF file for clinic policy or hybrid RAG for other knowledge.
9. Merge replies and reject output containing raw tool-call syntax, detected contact PII, or medicine-dose patterns.
10. Restore appropriate redacted values, save the turn, proposals, route, models, tools, usage, latency, handoffs, and guardrail events.

## 12. Agents, tools, confirmation, memory, and guardrails

### 12.1 Specialists

| Agent | Responsibility | Representative tools/actions |
|---|---|---|
| Triage | Symptoms, appropriate specialization, general health and clinic questions | `get_doctors`, `search_knowledge`, policy lookup; guidance only |
| Scheduling | Availability, appointments, booking, cancellation, rescheduling, waitlist, follow-up operations | Appointment/slot reads and scheduling proposals |
| Billing | Bills, fees, payment, refund policy | Own/reception billing reads and bill/payment proposals |
| Records | Profile, prescriptions, history, consultations, role administration | Profile/record reads, consultation completion, role-promotion proposals |

Tools are filtered by signed-in role. Shared read-only tools are available where needed; mutation proposals belong to a responsible specialist.

### 12.2 Proposal-confirm write protocol

1. A `propose_*` tool validates arguments and writes an `ai_pending_actions` row.
2. The UI renders a human-readable Confirm/Cancel card.
3. Confirm sends a separate request. The backend atomically claims the pending action, preventing second execution.
4. The action is revalidated and performed through the caller's JWT.
5. Success/failure is persisted and reflected on the card. Cancel marks the proposal without performing it.

Covered actions include patient booking/cancellation/rescheduling/waitlist acceptance; doctor consultation completion; and receptionist confirmation, rescheduling, cancellation, billing, payment, role promotion, and follow-up resolution.

### 12.3 Conversation memory

`ai_conversation_state` stores a small JSON object per conversation with RLS ownership and an 8 KB database constraint. V3 ignores state older than 24 hours. It carries items such as specialization, doctor, date, pending intent, selected patient, and recently listed appointments, allowing follow-ups such as “any time is fine” or “reschedule the next one.”

### 12.4 Safety behavior

- deterministic emergency guidance directs users to Bangladesh emergency number 999;
- triage is guidance, not diagnosis;
- no medicine dose is returned by the assistant;
- other patients' retrieved records are anonymised and dosage amounts are replaced with `[dose omitted]`;
- injection phrases, special prompt tokens, role-override claims, and prompt-exfiltration requests are detected;
- PII placeholders prevent supported contact/identity patterns from reaching models;
- final output checks reject raw tool protocol, contact PII, and dose patterns;
- low-confidence routing asks for clarification.

These are practical controls, not a claim of complete medical safety or exhaustive PII detection.

## 13. OKF policies and RAG

V3 separates authoritative clinic policy from generated/retrieved knowledge.

**OKF:** 15 reviewed Markdown files cover accounts and roles, booking, cancellation, consultation fees, emergency guidance, medical-record access, no-show policy, opening hours, payment methods, prescription renewal, privacy, refunds, reminder/email preferences, rescheduling, and waitlist behavior. They are bundled into a generated TypeScript module and cited as `[OKF:<id>]`.

**RAG:** general clinic and health questions use synthetic FAQs, visit notes, and prescriptions. Search results are cited by record id. The assistant must ground answers in returned material and decline unsupported questions.

This split is evidence-driven: in the policy evaluation, search-only answers averaged 3.14/5 and contradicted policy five times, while OKF answers averaged 4.73/5 with 14 of 15 fully correct.

## 14. Corpus generation, validation, embeddings, upload, and search

### 14.1 Corpus composition

| Record type | Accepted |
|---|---:|
| Visit notes | 11,028 |
| Prescriptions | 9,500 |
| FAQs | 230 |
| **Total** | **20,758** |

The manifest intended 20,850 records across 417 50-row slices. The final corpus is 92 records below the manifest; `summary.json` lists 94 excluded output entries because two malformed extras were not in the manifest. Of accepted records, 13,208 contain LLM-written prose and 7,550 are script-rendered. There are 20,638 searchable rows; 120 doctor-specific fictional FAQs are hidden so live doctor data remains authoritative.

### 14.2 Generation and validation

- A2 base seed `20260929`: 2,700 visits, 2,300 prescriptions, 250 FAQs.
- A3 extension seed `20261002`: 8,400 visits and 7,200 prescriptions, with new patients and no reused doctor slots, anchors, or names.
- `catalog.mjs` defines controlled facts and vocabulary.
- `generate-manifest.mjs` fixes patient, doctor, date, diagnosis, regimen, difficulty, context, occupation, and vital anchors before prose generation.
- Visit prose is generated through `generate-llm.mjs` or the manual `chat-helper.mjs`; prescriptions may be deterministically rendered.
- `validate-batch.mjs` checks identifiers, CSV shape, headers, required facts, medicines, plans, lengths, and near-duplicates.
- `build-corpus.mjs` revalidates slices, applies later correction files, excludes failures, joins metadata, and writes `corpus_clean.jsonl` plus `summary.json`.

### 14.3 Embeddings and upload

Assessment 2 used `gemini-embedding-001`, 768 dimensions, through LiteLLM. Quota limited the evaluated index to 1,960 rows.

Assessment 3 uses **Supabase/gte-small, 384 dimensions**, through Transformers.js for documents and `Supabase.ai` in the Edge runtime for live queries. All **20,758** accepted rows are embedded. Local generation is batched, append-only, and resumable; `upload-gte.mjs` upserts by `doc_id` without overwriting the A2 vector. A recorded 20-row local-versus-Edge parity check reached cosine 1.000. Median input length is 169 tokens; one 547-token record is truncated to the model's 512-token limit.

### 14.4 Production retrieval

`match_rag_documents` fuses:

1. 384d vector cosine search with production threshold 0.82;
2. English full-text search;
3. trigram/word-similarity search for typo tolerance;
4. reciprocal-rank fusion.

RLS filters hidden and synthetic noise rows. V3 requests up to 20 candidates and asks `carebridge-agent` to rerank to five. The production reranker has a six-second caller budget; timeout or invalid output retains fused order.

## 15. LiteLLM models, timeouts, and fallbacks

The gateway configuration is public at [litellm_config.yaml](https://github.com/shahriar-rashid-13/carebridge-liteLLM/blob/main/litellm_config.yaml).

| Alias | Provider model | Timeout | Use |
|---|---|---:|---|
| `carebridge-agent` | `gemini/gemini-3.1-flash-lite`, primary key | 12 s | Primary chat/tool calling |
| `carebridge-agent-retry` | Same model, second Gemini key/project | 12 s | Compatible quota/transient retry |
| `carebridge-agent-fallback` | `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` | 12 s | First non-Gemini fallback |
| `carebridge-agent-fallback-2` | `openrouter/qwen/qwen3.8-27b:free`, reasoning disabled | 12 s | Final chat fallback |
| `carebridge-embed` / `-2` | `gemini/gemini-embedding-001`, 768d | 20 s each | A2 document/query embeddings |
| `carebridge-judge` / `-2` | `gemini/gemini-3.5-flash` | 30 s each | Evaluation only |

`num_retries` is zero; failover is explicit. A fully exhausted chat chain has 48 seconds of configured provider timeout, embeddings 40 seconds, and judging 60 seconds, excluding network/routing overhead. Agent callers cap a gateway call at 55 seconds; the v3 supervisor uses 25 seconds so both Gemini keys can be attempted; production reranking uses six seconds.

When a non-Gemini fallback answers a tool round, later rounds use the fallback alias so Gemini is not given tool history lacking Gemini thought signatures. Response headers identify the serving model group for observability. The gateway itself has no persistence, response cache, custom rate limiter, database, or clinic-specific authorization.

## 16. Resend, recall campaigns, and unsubscribe

### Email pipeline

1. A `reminder_24h` notification triggers an idempotent `message_outbox` row.
2. `pg_cron` invokes `message-dispatcher` every minute only when work is due.
3. The worker claims rows with `FOR UPDATE SKIP LOCKED`, suppresses sends during 22:00–08:00 Dhaka quiet hours, rechecks opt-outs, and sends through Resend.
4. Failed sends retry after 1, 5, 15, and 60 minutes, with no more than five attempts.
5. The Resend webhook verifies the Svix HMAC signature and a five-minute freshness window, deduplicates on `svix_id`, and advances status without allowing late events to regress delivery state.
6. Failures and bounces generate receptionist-visible operational notifications.

### Recall campaigns

Receptionists can preview and send three segments: check-up overdue, missed visit, and follow-up overdue. Preview reports total, eligible, excluded by opt-out/no email/frequency cap, remaining daily capacity, and sample recipients. Sending supports `{name}`, a daily limit of 100 emails, next-day scheduling after the limit, and a seven-day per-patient campaign frequency cap.

Campaign results aggregate recipients, skipped/scheduled/sent/delivered/bounced/complained/failed/opted-out counts and bookings created within 14 days. This is an attribution window, not proof that the email caused the booking.

Unsubscribe URLs use a signed HMAC token valid for 60 days and one-click `List-Unsubscribe` headers. Opt-out is checked when queued and again immediately before sending. Because the deployment uses Resend sandbox mode without a verified sending domain, synthetic patient messages are redirected to the configured sandbox recipient.

## 17. Google Calendar integration

Appointment confirmation or a change to a confirmed appointment queues an `upsert`; cancellation of a confirmed/completed appointment queues a `delete`. Only one queued job exists per appointment, and a newer change replaces its action. `calendar-sync` runs every minute, signs a Google service-account JWT, and creates, updates, or removes the event from the shared clinic calendar.

The calendar event id is deterministically derived from the appointment id, so retries do not create duplicates. Stuck `sending` jobs become claimable after ten minutes. The service-account JSON and calendar id remain Supabase secrets.

## 18. Observability and operational metrics

- Browser and relevant Edge Function errors go to Sentry with a `runtime` tag.
- Scrubbing removes user identity, request bodies, cookies, query strings, typed text, emails, phones, and UUID-like ids before export.
- Browser tracing samples 10% of page loads; session replay is disabled.
- Each assistant reply stores route, agents, tools, serving models, fallback calls, token usage, latency, handoffs, route source, and guardrail events.
- Receptionists use `/metrics` to compare v2/v3 latency, tokens, model calls, fallback share, tool errors, keyword routes, handoffs, guardrails, daily volume, and saved evaluation scores.
- Tagged evaluation conversations are excluded from production operational metrics.
- Outbox/event and calendar job status provide durable integration diagnostics.

## 19. Evaluation design and measured results

### 19.1 Agent task success

The [agent evaluation report](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/eval/AGENT_EVAL_REPORT.md) uses 42 labelled scenarios across scheduling, triage, billing, records, policy, multi-intent, ambiguity, safety, doctor, and reception categories. Three runs per version used live functions and demo-role accounts. Proposals were never confirmed.

A run passes only when status, expected agent, required/forbidden tools, expected proposal, response text, and safety checks all pass.

| Measure | v2 baseline | v3 |
|---|---:|---:|
| Mean task success | 92.8% | **96.0%** |
| Saved scenario runs passed | 116/125 | **120/125** |
| Pass in every complete run (`pass^3`) | 85.4% | **95.1%** |
| Pass in at least one run (`pass@3`) | 97.6% | 97.6% |
| Policy | 75.0% | **100%** |
| Scheduling | 77.8% | **94.1%** |
| Safety | 100% | 100% |
| Mean latency | **8.7 s** | 10.7 s |
| Mean tokens/turn | 7,513 | **6,381** |
| Runs answered by fallback | 7.2% | **5.6%** |

Caveats: one v3 scenario run and one v2 run were unsaved; the report uses available saved runs. Post-evaluation fixes are not included in the table. V3 still failed the “fee and free slots” multi-intent scenario in all three runs because the supervisor selected billing without a scheduling handoff.

### 19.2 Retrieval

The [A3 search report](https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/eval/SEARCH_EVAL_V3_REPORT.md) uses 30 matching, 25 answerable edge, 5 out-of-scope, and 30 noisy queries.

| Variant/set | Hit@5 | MRR | P@5 |
|---|---:|---:|---:|
| A2 Gemini hybrid, 1,960 rows — matching | 1.00 | 1.00 | 0.47 |
| A2 — edge | 0.96 | 0.94 | 0.54 |
| A2 — noisy | 0.97 | 0.97 | 0.45 |
| A3a gte-small, 20,758 rows — matching | 1.00 | 0.97 | 0.56 |
| A3a — edge | 0.88 | 0.88 | 0.62 |
| A3a — noisy | 0.87 | 0.79 | 0.49 |
| A3b reranked 20→5 — matching | **1.00** | **1.00** | **0.63** |
| A3b — edge | 0.92 | 0.92 | 0.62 |
| A3b — noisy | 0.90 | 0.90 | 0.57 |

A3b returned nothing for all five out-of-scope questions. Four of 85 reranks fell back to fused order in evaluation. A same-1,960-row dense comparison showed gte-small behind Gemini on edge/noisy Hit@5 (0.92/0.90 versus 1.00/1.00), supporting the caveat that quota-free gte-small trades some short/noisy-query quality for full-corpus coverage.

Both A2 and A3b scored 5.00/5.00 for judged faithfulness and relevance on 30 matching questions. These were easy matching questions and the judge did not distinguish the systems.

### 19.3 Noise and classification

In the A2 noise experiment, noisy-query Hit@5 fell from 0.97 on the clean index to 0.47 when 300 synthetic noise rows were included. Production hides noise at ingestion/RLS.

The published specialization classification results are **stale A2 metrics based on a 2,580-visit-note snapshot**, split into 2,064 training and 516 grouped held-out notes. They are not A3 full-corpus results.

| Classification evaluation | Result |
|---|---:|
| TF-IDF + logistic regression, grouped held-out synthetic notes | 100.0% |
| Same held-out notes, stressed | 98.4% |
| Routing FAQs | 97.9% |
| Hand-written lay descriptions | 79.2% |
| Gemini zero-shot, hand-written descriptions | 89.6% |
| Gemini zero-shot, 120 stressed notes | 88.3% |

The hand-written score is more informative than the highly regular synthetic held-out score. Rerunning the current script would use all visit notes and overwrite the report, so the published classification metrics should remain labelled as the recorded A2 snapshot.

### 19.4 No-show prediction

The [no-show report](https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/noshow/NOSHOW_REPORT.md) uses 110,516 cleaned appointments from Vitória, Brazil, April–June 2016. History features use earlier days only. Chronological train/validation/test splits prevent random future leakage. Thresholds were selected on validation and evaluated once on the 26,449-row test set (18.5% no-shows).

| Model | Threshold | Precision | Recall | F1 | PR-AUC | ROC-AUC | Flagged |
|---|---:|---:|---:|---:|---:|---:|---:|
| Earlier-no-show rule | — | 0.247 | 0.266 | 0.256 | — | — | 19.9% |
| Logistic regression, tuned | 0.231 | 0.290 | 0.782 | 0.423 | 0.334 | 0.724 | 49.7% |
| **Gradient boosting, tuned** | **0.246** | **0.307** | 0.679 | **0.423** | **0.349** | **0.735** | 40.8% |

Gradient boosting is preferred because it has better PR-AUC and flags fewer visits at the same F1. Precision near 31% supports a low-cost reminder or confirmation call, not denial, penalties, or automatic overbooking. The model is offline and is not used for live clinical or scheduling decisions.

## 20. Testing and CI

### Clinic application

The final release reports **464 Vitest tests** and **8 Playwright tests**.

| Test area | Coverage |
|---|---|
| Unit/UI | Auth and clinic stores, adapters, role filtering, automations, notification UI, AI panel, campaigns, metrics, Sentry, evaluation scoring |
| Edge Function | v2 handler/tools/actions/gateway/RAG; v3 handler, state, guardrails, routing, knowledge; email dispatcher, webhook, unsubscribe, calendar |
| E2E | Three-role login/access behavior and a serial booking lifecycle that creates and cleans up appointment data |

Vitest Edge tests use an in-memory database and mocked gateway, so `npm test` needs neither network nor production secrets. E2E uses role-specific accounts and a real test database, runs serially, and cleans up its mutations.

The [clinic CI workflow](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/actions/workflows/ci.yml) uses Node.js 22:

- pull request and `main` push: `npm ci`, `npx tsc --noEmit`, `npm test`, `npm run build`;
- only successful pushes to `main`: install Chromium and run Playwright;
- cross-run E2E concurrency is serialized;
- failed Playwright reports/results are retained for seven days.

The [gateway CI workflow](https://github.com/shahriar-rashid-13/carebridge-liteLLM/actions/workflows/ci.yml) compiles `app.py`, parses YAML, requires model entries/provider names, and rejects literal key-like values. It does not install the full proxy, contact providers, test live fallback behavior, or deploy Vercel. Live gateway diagnostics are manual and include model discovery/authentication, cross-key tool rounds, embedding/judge groups, and primary/fallback tool roundtrips; two diagnostic scripts report individual failures rather than enforcing a failing exit status.

## 21. Deployment, configuration, and environment variables

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key |
| `VITE_AI_FUNCTION` | Must be `carebridge-ai-v3` for current production behavior |
| `VITE_SENTRY_DSN` | Optional browser Sentry |

If `VITE_AI_FUNCTION` is omitted, source code falls back to the legacy function name; production/local reviewers should set it explicitly.

### Supabase Edge Functions

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | RLS-scoped AI clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Internal integration workers and temporary embedding check only |
| `SUPABASE_SECRET_KEYS` | Optional accepted keys for temporary `embed-check` |
| `LITELLM_BASE_URL`, `LITELLM_API_KEY` | Server-only model gateway |
| `CLINIC_TIMEZONE` | Optional; defaults to `Asia/Dhaka` |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | Optional Edge reporting |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` | Email delivery/webhook |
| `EMAIL_SANDBOX_TO` | Optional synthetic-recipient redirect |
| `UNSUBSCRIBE_SECRET`, `APP_URL` | Signed unsubscribe and public links |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID` | Calendar worker |

Vault also requires `project_url` and `dispatcher_token`; these are created outside migrations.

### LiteLLM gateway

`GEMINI_API_KEY`, `SECOND_GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_API_KEY_2`, `LITELLM_MASTER_KEY`, and deployment-resolvable `CONFIG_FILE_PATH`.

### Offline RAG/evaluation

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY`, optional direct `GEMINI_API_KEY`/`GEMINI_MODELS`, and `SEED_DOCTOR_PASSWORD` only for explicit synthetic-doctor mutations.

### Deployment behavior

Vercel deploys the frontend from `main`. The gateway repository supplies an ASGI entry point, config, and requirements, but route mapping, build settings, regions, duration, and automatic deployment remain Vercel project settings rather than repository guarantees. Database migrations and Edge Functions are deployed separately with Supabase CLI. AI functions retain JWT verification; internal cron/public self-verifying functions are deployed with `--no-verify-jwt` and perform their own authentication.

## 22. Repository maps

### `carebridge-clinic-flow`

| Public path | Contents |
|---|---|
| [`src/routes`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/src/routes) | TanStack file-based routes |
| [`src/components/clinic`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/src/components/clinic) | Role shell, workflow UI, notifications, AI panel |
| [`src/lib`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/src/lib) | Auth/clinic stores, Supabase, campaigns, metrics, Sentry |
| [`supabase/migrations`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/supabase/migrations) | Schema, RLS, RPCs, triggers, queues, cron |
| [`carebridge-ai-v3`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/supabase/functions/carebridge-ai-v3) | Production supervisor, agents, state, guardrails, OKF, RAG |
| [`carebridge-ai-v2`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/supabase/functions/carebridge-ai-v2) | A2 baseline and shared gateway/tool implementation |
| [`supabase/functions`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/supabase/functions) | AI, dispatcher, webhook, unsubscribe, calendar, diagnostic functions |
| [`tests`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/tests) | Unit, Edge, E2E, helpers |
| [`eval`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/eval) | Agent scenarios, saved results, report |
| [`docs`](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/tree/main/docs) | Architecture, assessments, demo, advisor evidence |

### `carebridge-rag`

| Public path | Contents |
|---|---|
| [`corpus`](https://github.com/shahriar-rashid-13/carebridge-rag/tree/main/corpus) | Validated JSONL corpus and summary |
| [`manifest`](https://github.com/shahriar-rashid-13/carebridge-rag/tree/main/manifest) | Seeded facts and generation slices |
| [`output`](https://github.com/shahriar-rashid-13/carebridge-rag/tree/main/output) | Generated CSVs, fixes, validation reports |
| [`scripts`](https://github.com/shahriar-rashid-13/carebridge-rag/tree/main/scripts) | Generation, validation, embedding, upload, evaluation, seeding |
| [`eval`](https://github.com/shahriar-rashid-13/carebridge-rag/tree/main/eval) | Labels, results, retrieval/classification reports |
| [`noshow`](https://github.com/shahriar-rashid-13/carebridge-rag/tree/main/noshow) | Notebook, training script, metrics, report |
| [`docs`](https://github.com/shahriar-rashid-13/carebridge-rag/tree/main/docs) | Corpus specification, generation contract, historical RAG plan |

### `carebridge-liteLLM`

| Public path | Contents |
|---|---|
| [`app.py`](https://github.com/shahriar-rashid-13/carebridge-liteLLM/blob/main/app.py) | Minimal ASGI entry point |
| [`litellm_config.yaml`](https://github.com/shahriar-rashid-13/carebridge-liteLLM/blob/main/litellm_config.yaml) | Model aliases, credentials references, timeouts, fallbacks |
| [`requirements.txt`](https://github.com/shahriar-rashid-13/carebridge-liteLLM/blob/main/requirements.txt) | Pinned proxy dependencies |
| [`tests`](https://github.com/shahriar-rashid-13/carebridge-liteLLM/tree/main/tests) | Live smoke and tool-round diagnostics |
| [`.github/workflows/ci.yml`](https://github.com/shahriar-rashid-13/carebridge-liteLLM/blob/main/.github/workflows/ci.yml) | Static gateway checks |

## 23. Local development and reproduction

### Application

```bash
cd carebridge-clinic-flow
npm install
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Create ignored `.env.local` with the frontend variables and ignored `.env.test` with `E2E_BASE_URL` plus patient, doctor, and receptionist email/password pairs. If `E2E_BASE_URL` is omitted, Playwright starts the local server on port 4173.

Apply migrations and deploy functions:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy carebridge-ai-v3
npx supabase functions deploy carebridge-ai-v2
npx supabase functions deploy message-dispatcher --no-verify-jwt
npx supabase functions deploy calendar-sync --no-verify-jwt
npx supabase functions deploy resend-webhook --no-verify-jwt
npx supabase functions deploy unsubscribe --no-verify-jwt
```

### Agent evaluation

```bash
node scripts/agent-eval.mjs --run <run-id>
node scripts/agent-eval.mjs --run <run-id> --versions v2,v3 --only <scenario-ids>
node scripts/agent-eval.mjs --rescore <run-id>
node scripts/agent-eval-report.mjs --v2 <run1,run2,run3> --v3 <run1,run2,run3>
```

The evaluator does not confirm proposals.

### Corpus and search

```bash
cd carebridge-rag
npm install
node scripts/generate-manifest.mjs
node scripts/generate-llm.mjs
node scripts/render-prescriptions.mjs
node scripts/validate-batch.mjs
node scripts/build-corpus.mjs
node scripts/embed-gte.mjs --batch 32
node scripts/upload-gte.mjs --batch 200
node scripts/check-gte.mjs
node scripts/rag-eval.mjs --model gte --cutoff 0.82
node scripts/search-eval-v3.mjs --pace 4000
```

Generation is deterministic for manifest facts and scripted prescriptions; new LLM prose need not be byte-identical. Embedding and upload commands are resumable and idempotent by `doc_id`.

### Classification and no-show study

```powershell
cd carebridge-rag
py -3 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-eval.txt
.\.venv\Scripts\python scripts\classify-eval.py
node scripts/classify-llm.mjs --per-class 10

cd noshow
py -3 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python train.py
```

Download the [Kaggle dataset](https://www.kaggle.com/datasets/joniarroba/noshowappointments) to `noshow/data/KaggleV2-May-2016.csv`; it is intentionally uncommitted.

### LiteLLM

```powershell
cd carebridge-liteLLM
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
litellm --config litellm_config.yaml --port 4000
python tests\test_proxy.py
node tests\test_second_key.mjs
.\tests\test_tool_roundtrip.ps1 -Gateway http://localhost:4000
```

## 24. Design decisions

| Decision | Rationale and trade-off |
|---|---|
| Enforce authorization in RLS and RPCs | One policy surface protects UI and AI tools; requires careful security-definer review |
| Keep the gateway stateless and clinic-blind | Centralizes provider failover without creating a second data-access backend |
| Proposal before every AI write | Human control, clear audit trail, and retry safety; adds an interaction step |
| Deterministic emergency path | Emergency wording is available even during model failure and is not model-generated |
| Separate OKF policy from RAG | Reviewed rules outperform synthetic retrieval for exact clinic policy |
| Use gte-small locally and in Edge | Full 20,758-row coverage without embedding quota; weaker than Gemini on short/noisy queries |
| Hybrid retrieval plus reranking | Combines semantic, lexical, and typo tolerance; reranking adds latency and can time out |
| Durable outbox/queue integrations | Idempotency, retry, visibility, and recovery instead of synchronous third-party calls |
| Time-based no-show split and earlier-day history | Better matches deployment and avoids same-day/future outcome leakage |
| Run live E2E only on `main` pushes | Protects pull requests and serializes database mutation; reduces PR-stage browser feedback |

## 25. Known limitations and future work

### Known limitations

- Free/quota-constrained Gemini and OpenRouter endpoints can exhaust quota, change latency, or be unavailable. Fallbacks reduce but do not eliminate outages.
- V3 saves tokens and improves consistency but is about two seconds slower because it adds supervisor routing and may rerank retrieval.
- Multi-intent routing remains imperfect; a supervisor can omit a needed handoff.
- Production reranking uses a six-second budget and may fall back more often than the 20-second evaluation.
- gte-small trails Gemini on short edge and noisy questions; one corpus row is truncated at 512 tokens.
- PII and dose detection are regex-based defenses, not comprehensive data-loss prevention.
- Resend sandbox mode redirects synthetic recipients until a domain is verified.
- The no-show model uses six weeks of 2016 Brazilian data, has modest precision, and is not deployed.
- Classification headline metrics remain tied to the stale 2,580-note A2 snapshot.
- LLM-as-judge scores can be biased even though a different model group is used.
- Migrations assume the pre-existing Assessment 1 schema; a clean full-schema bootstrap is absent.
- Gateway Vercel route/build/duration settings are external project configuration, not reproducible from the repository alone.

### Recommended future work

1. Add a reviewed full bootstrap migration and automated RLS regression tests against a disposable Supabase instance.
2. Improve supervisor multi-intent training/examples and add deterministic intent coverage checks.
3. Verify a sending domain, remove sandbox redirection, and add integration dashboards/alerts for queue age and permanent failures.
4. Re-evaluate classification on the 11,028-note corpus with a frozen split and versioned report.
5. Collect locally representative appointment outcomes, recalibrate the no-show model, add fairness checks, and keep any intervention non-punitive.
6. Benchmark stronger small embeddings or query rewriting while retaining local/Edge feasibility.
7. Add strict provider-backed gateway tests in a protected scheduled workflow with quota-aware controls.
8. Add disaster-recovery documentation, secret rotation procedures, and queue replay runbooks.

## 26. Reviewer handoff links and demo accounts

### Primary documents

| Document | Public link |
|---|---|
| Clinic README | [https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/README.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/README.md) |
| RAG README | [https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/README.md](https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/README.md) |
| Gateway README | [https://github.com/shahriar-rashid-13/carebridge-liteLLM/blob/main/README.md](https://github.com/shahriar-rashid-13/carebridge-liteLLM/blob/main/README.md) |
| Project overview | [https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/PROJECT_OVERVIEW.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/PROJECT_OVERVIEW.md) |
| Agent evaluation | [https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/eval/AGENT_EVAL_REPORT.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/eval/AGENT_EVAL_REPORT.md) |
| Search evaluation | [https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/eval/SEARCH_EVAL_V3_REPORT.md](https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/eval/SEARCH_EVAL_V3_REPORT.md) |
| A2 RAG evaluation | [https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/eval/RAG_EVAL_REPORT.md](https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/eval/RAG_EVAL_REPORT.md) |
| gte-small evaluation | [https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/eval/RAG_EVAL_REPORT_GTE.md](https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/eval/RAG_EVAL_REPORT_GTE.md) |
| Classification report | [https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/eval/CLASSIFICATION_REPORT.md](https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/eval/CLASSIFICATION_REPORT.md) |
| Corpus summary | [https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/corpus/summary.json](https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/corpus/summary.json) |
| No-show report | [https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/noshow/NOSHOW_REPORT.md](https://github.com/shahriar-rashid-13/carebridge-rag/blob/main/noshow/NOSHOW_REPORT.md) |
| Demo script | [https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-3/DEMO_SCRIPT.md](https://github.com/shahriar-rashid-13/carebridge-clinic-flow/blob/main/docs/assessment-3/DEMO_SCRIPT.md) |

### Demo accounts

| Role | Name | Email |
|---|---|---|
| Patient | Sarah Jenkins | `sarah@example.com` |
| Doctor | Dr. Marcus Vance | `marcus@example.com` |
| Receptionist | Clara Morgan | `clara@example.com` |

Passwords are intentionally omitted from this report and repository. They are supplied through the private reviewer/Dev Control Tower handoff. No real secret is included here.
