# CareBridge V2 AI Migration Checklist

**Status:** ✅ Audit Complete — Ready for V2 Implementation  
**Last Updated:** Friday, Sep 25, 2026

---

## Pre-V2 (Current State) ✅

### Frontend
- [x] Chat UI component (`carebridge-ai-panel.tsx`)
- [x] Conversation persistence (ai_conversations table)
- [x] Message history (ai_messages table)
- [x] Role-aware labels (Patient/Doctor/Receptionist)
- [x] Markdown rendering
- [x] Action buttons / quick prompts
- [x] Error handling & loading states
- [x] RLS policies for conversation privacy

### Backend (Edge Function)
- [x] Authentication (JWT token validation)
- [x] Role detection from profiles table
- [x] Tool definitions (names, descriptions, parameters)
- [x] Tool execution framework (`runTool()`)
- [x] Message history validation
- [x] Patient tools (8 tools)
- [x] System prompt with booking instructions
- [x] XML-style booking proposal marker
- [x] Error messages & validation logic

### Clinic Core (Unchanged)
- [x] Patient workflow
- [x] Doctor workflow
- [x] Receptionist workflow
- [x] Appointments system
- [x] Prescriptions system
- [x] Billing system
- [x] Doctor management
- [x] Double-booking protection
- [x] Role-based access control (RLS)
- [x] Patient profile management

### Provider Integration (To Replace)
- [x] Gemini API integration
- [x] model-config-gemini.ts
- [x] GEMINI_API_KEY env variable

---

## V2 Phase A: Infrastructure Setup

**Objective:** Deploy LiteLLM gateway and configure provider routing

### Tasks

- [ ] Create separate GitHub repository for LiteLLM gateway
- [ ] Create separate Vercel project for LiteLLM
- [ ] Set up LiteLLM configuration:
  - [ ] Primary model selection (Gemini? Claude? Others?)
  - [ ] Fallback models (2-3 options)
  - [ ] API keys for each provider (in gateway only, not in frontend)
  - [ ] OpenAI-compatible endpoint configuration
- [ ] Deploy LiteLLM to Vercel #2
- [ ] Generate/configure `LITELLM_API_KEY` for authentication
- [ ] Test LiteLLM independently with OpenAI-compatible client
- [ ] Document: `LITELLM_GATEWAY_URL` for Edge Function

### Verification

- [ ] LiteLLM responds to health check
- [ ] OpenAI-compatible endpoint works
- [ ] Primary model responds successfully
- [ ] Fallback routing works (simulate provider failure)
- [ ] Rate limiting handled gracefully

---

## V2 Phase B: Minimal Edge Function

**Objective:** Create clean new Edge Function that delegates to LiteLLM (no tools yet)

### Tasks

- [ ] Create `/supabase/functions/carebridge-ai/index-v2.ts`
- [ ] Implement:
  - [ ] JWT authentication
  - [ ] Role detection
  - [ ] Message history validation
  - [ ] System prompt for general conversation
  - [ ] Call to LiteLLM proxy endpoint
  - [ ] Response passthrough to frontend
- [ ] Remove:
  - [ ] Direct Gemini API calls
  - [ ] Gemini request format adapter
  - [ ] Gemini response parser
- [ ] Keep:
  - [ ] SUPABASE_URL, SUPABASE_ANON_KEY environment variables
  - [ ] Add: LITELLM_GATEWAY_URL, LITELLM_API_KEY
- [ ] Test with real requests (no tool calling)

### Verification

- [ ] Patient can chat with AI (no tools)
- [ ] Responses are natural language only
- [ ] Message history works
- [ ] Role isolation works (only patient gets tools later)
- [ ] LiteLLM fallback works if primary fails

---

## V2 Phase C: Tool Framework

**Objective:** Add tool registry, validation, and execution scaffold

### Tasks

- [ ] Define tool structure (name, description, parameters)
- [ ] Create tool allowlist by role:
  - [ ] Patient tools
  - [ ] Doctor tools (prepare, don't enable yet)
  - [ ] Receptionist tools (prepare, don't enable yet)
- [ ] Implement tool validation layer
- [ ] Scaffold tool execution handler
- [ ] Handle OpenAI-compatible tool call format from LiteLLM

### Verification

- [ ] Tool definitions match OpenAI function calling format
- [ ] Role-to-tools mapping correct
- [ ] Tool validation catches invalid arguments
- [ ] Tool execution handler ready for actual implementations

---

## V2 Phase D: Patient Tools (Core Booking)

**Objective:** Rebuild patient tools with new architecture

### Tasks

- [ ] Implement:
  - [ ] `get_doctors` (list active doctors)
  - [ ] `get_available_slots` (check doctor availability)
  - [ ] `get_my_appointments` (patient's appointments)
  - [ ] `get_my_prescriptions` (patient's prescriptions)
  - [ ] `get_my_profile` (patient profile)
- [ ] Test each tool independently

### Verification

- [ ] `get_doctors` returns correct list
- [ ] `get_available_slots` respects doctor schedule + double-booking constraint
- [ ] `get_my_appointments` shows only patient's appointments
- [ ] `get_my_prescriptions` shows only patient's prescriptions
- [ ] `get_my_profile` shows patient's current profile

---

## V2 Phase E: Structured Booking Proposal

**Objective:** Replace XML marker with structured application-level proposal

### Changes

**Current:**
```
Assistant: "I can book you with Dr. Marcus on Sept 26 at 10:00 AM"
<carebridge-booking-proposal>{"doctor_id":"...", "appointment_date":"2026-09-26", "time_slot":"10:00 AM", "reason":"..."}
</carebridge-booking-proposal>

User: "Yes, confirm"
```

**Future:**
```
Assistant proposes via structured JSON response
Frontend renders confirmation dialog
User clicks [Confirm Booking]
Backend validates proposal + re-checks availability + inserts appointment
```

### Tasks

- [ ] Define booking proposal JSON schema
- [ ] Update system prompt (remove XML marker)
- [ ] Modify Edge Function to handle proposal requests
- [ ] Update frontend to render proposal confirmation UI
- [ ] Implement proposal validation:
  - [ ] Verify doctor exists
  - [ ] Verify date is valid
  - [ ] Re-check slot availability (final check)
  - [ ] Verify no double-booking (database constraint)
- [ ] Implement booking creation after confirmation

### Verification

- [ ] Proposal rendered clearly in UI
- [ ] User confirms via button click (not text)
- [ ] Slot availability re-checked before insertion
- [ ] Double-booking prevented by database constraint
- [ ] Appointment created successfully

---

## V2 Phase F: Reschedule & Cancel

**Objective:** Complete patient action tools

### Tasks

- [ ] `cancel_appointment` (patient cancels own appointment)
- [ ] `reschedule_appointment` (patient reschedules with new proposal)

### Verification

- [ ] Cancelled appointment shows status = cancelled
- [ ] Slot becomes available to other patients
- [ ] Rescheduling follows same proposal + confirmation flow
- [ ] Patient cannot cancel/reschedule others' appointments

---

## V2 Phase G: Doctor & Receptionist Tools

**Objective:** Extend to additional roles

### Doctor Tools

- [ ] `get_today_schedule` (doctor's appointments for today)
- [ ] `get_patient_summary` (basic info for patient in appointment)
- [ ] `get_patient_history` (past appointments with this doctor)
- [ ] `create_prescription` (write prescription for appointment)
- [ ] `complete_consultation` (mark appointment completed)

### Receptionist Tools

- [ ] `search_patients` (find patient by name/ID)
- [ ] `get_appointments` (list appointments with filters)
- [ ] `confirm_appointment` (receptionist approves patient booking)
- [ ] `reschedule_appointment` (receptionist moves appointment)
- [ ] `cancel_appointment` (receptionist cancels)
- [ ] `promote_patient_to_doctor` (upgrade patient role)
- [ ] `create_invoice` (generate bill for completed appointment)
- [ ] `mark_invoice_paid` (update billing status)

### Verification

- [ ] Each tool respects role isolation (RLS)
- [ ] Doctor cannot see other doctors' appointments
- [ ] Receptionist can see all appointments
- [ ] Tool execution validates user permissions

---

## V2 Phase H: Production Testing

**Objective:** Comprehensive validation before production release

### Security Tests

- [ ] Authentication fails with invalid token ✓
- [ ] Unauthenticated request returns 401 ✓
- [ ] Patient cannot access doctor-only tools ✓
- [ ] Patient cannot see another patient's appointments ✓
- [ ] Doctor cannot see another doctor's patients ✓
- [ ] Receptionist can see all (except other users' personal data) ✓
- [ ] Prompt injection attempts blocked ✓
- [ ] Malformed tool arguments rejected ✓

### Functional Tests

- [ ] Tool argument validation works
- [ ] Database errors handled gracefully
- [ ] Double-booking prevented by constraint ✓
- [ ] Cancelled appointments free up slots ✓
- [ ] Completed appointments stay booked ✓
- [ ] Booking proposal matches confirmed booking ✓
- [ ] Tool results accurate (no stale data) ✓

### Provider Tests

- [ ] Primary model works
- [ ] Fallback model works (simulate primary failure)
- [ ] Rate limit (429) handled with user message ✓
- [ ] Timeout handled gracefully ✓
- [ ] Provider error (500) returns user-friendly message ✓
- [ ] Network failure doesn't crash Edge Function ✓

### Model Tests

- [ ] Model understands booking intent
- [ ] Model calls correct tools in right order
- [ ] Model doesn't invent patient data
- [ ] Model doesn't claim bookings succeeded without confirmation
- [ ] Model respects tool results (doesn't override DB truth)

### End-to-End Scenarios

- [ ] Patient books appointment start-to-finish
- [ ] Receptionist confirms patient booking
- [ ] Doctor sees confirmed appointment + writes prescription
- [ ] Patient views prescription
- [ ] Receptionist creates invoice
- [ ] Doctor rescinds/cancels appointment (no-show scenario)

### Performance Tests

- [ ] Edge Function responds in <5 seconds (without LLM wait)
- [ ] LiteLLM fallback activates within reasonable time
- [ ] No memory leaks in long conversations
- [ ] Rate limiting doesn't cause cascading failures

### Verification

All tests pass, documented with logs/screenshots

---

## V2 Post-Stabilization Cleanup

**Objective:** Remove old code after new implementation proven

### Tasks

- [ ] Run Phase A-H tests for 1 week in production
- [ ] Confirm zero regressions
- [ ] Delete `supabase/functions/carebridge-ai/index-gemini.ts`
- [ ] Delete `supabase/functions/carebridge-ai/model-config-gemini.ts`
- [ ] Remove `GEMINI_API_KEY` from Supabase secrets
- [ ] Update documentation to reference new architecture
- [ ] Archive old Edge Function code (in git history)

---

## Assessment 2 Requirements (Separate from V2 AI)

**Note:** These are additional requirements on top of V2. Not part of core V2 migration.

### RAG System (20 pts)

- [ ] Create ≥5,000 synthetic records (visit notes, prescriptions, FAQ)
- [ ] Enable pgvector extension in Supabase
- [ ] Implement embedding + chunking pipeline
- [ ] Store embeddings in vector database
- [ ] Implement retrieval (cosine similarity, top-k)
- [ ] Test 3 query sets:
  - [ ] Matching queries (answerable directly)
  - [ ] Extreme/edge queries (rare, long, ambiguous)
  - [ ] Noisy queries (typos, junk tokens)
- [ ] Report retrieval quality with vs without noise

### LLM Classification (15 pts)

- [ ] Task: Predict department from symptom description OR predict no-show risk
- [ ] Create labeled dataset from seed data
- [ ] Split train/test (e.g., 80/20)
- [ ] Build classifier:
  - [ ] Option A: LLM few-shot classification
  - [ ] Option B: scikit-learn on embeddings
- [ ] Train on training set
- [ ] Evaluate on held-out test set
- [ ] Report ≥70% accuracy with evidence

### Automations (15 pts)

- [ ] Appointment reminders: 24h before via email/SMS
- [ ] No-show flagging: mark appointment as no-show, send follow-up
- [ ] Auto-reschedule: when slot cancelled, offer to waitlisted patient

### Tests (15 pts)

- [ ] Unit tests for: auth, roles, workflows, RAG, agent
- [ ] E2E test for happy-path booking flow
- [ ] All tests pass with single `npm run test` command

### UI/UX (10 pts)

- [ ] Loading states
- [ ] Empty states
- [ ] Error states
- [ ] Responsive layout (mobile/tablet/desktop)
- [ ] Clean agent chat UI
- [ ] Automation feedback (e.g., "Reminder sent to patient")

### Docs & Submission (5 pts)

- [ ] Updated README covering: agent, automations, RAG, tests
- [ ] RAG evaluation results table
- [ ] Accuracy metrics + confusion matrix
- [ ] Test run output
- [ ] Updated test credentials
- [ ] Submit on Dev Control Tower by Wed 30 Sep

---

## Current Status Summary

| Phase | Status | Est. Duration |
|-------|--------|----------------|
| **Audit & Prep** | ✅ Done | — |
| **Phase A: LiteLLM Infra** | 🔲 Not started | 2-3 days |
| **Phase B: Minimal Edge Fn** | 🔲 Not started | 1-2 days |
| **Phase C: Tool Framework** | 🔲 Not started | 1 day |
| **Phase D: Patient Tools** | 🔲 Not started | 2-3 days |
| **Phase E: Booking V2** | 🔲 Not started | 2 days |
| **Phase F: Cancel/Reschedule** | 🔲 Not started | 1-2 days |
| **Phase G: Doctor/Receptionist** | 🔲 Not started | 3-4 days |
| **Phase H: Production Testing** | 🔲 Not started | 2-3 days |
| **Assessment 2: RAG** | 🔲 Not started | 3-4 days |
| **Assessment 2: Classification** | 🔲 Not started | 2-3 days |
| **Assessment 2: Automations** | 🔲 Not started | 2-3 days |
| **Assessment 2: Tests** | 🔲 Not started | 2 days |
| **Assessment 2: UI/UX Polish** | 🔲 Not started | 2 days |
| **Submission** | 🔲 Not started | Wed 30 Sep |

**Total estimate:** 25-35 days (aggressive parallelization possible)

---

## Key Contacts & Resources

- **KT Document:** `kt.md` (source of truth for V2 architecture)
- **Audit Document:** `AI_V2_AUDIT.md` (detailed technical breakdown)
- **This Checklist:** `V2_MIGRATION_CHECKLIST.md`
- **Cleanup Report:** `AI_V2_CLEANUP_REPORT.md`
- **Git Repo:** `https://github.com/shahriar-rashid-13/carebridge-clinic-flow`
- **Live App:** `https://carebridge-clinic-flow.vercel.app/`
- **Lovable Project:** `https://lovable.dev/projects/f16717f9-449b-4583-b0a1-5909a58c64a0`

---

## Notes

- Frontend remains unchanged through all phases
- Clinic core functionality untouched
- Database schema stable; only adding tables for RAG/metrics
- No secrets in frontend at any phase
- All provider routing happens in LiteLLM gateway (separate project)
- Keep `index-gemini.ts` as reference until Phase B+C stabilize
- Lovable integration preserved (no history rewriting)

---

**Next Step:** Create LiteLLM gateway project (Phase A)
