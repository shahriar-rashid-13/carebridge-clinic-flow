# CareBridge AI V2 Migration Audit

**Date:** Friday, Sep 25, 2026  
**Scope:** Audit existing CareBridge project for AI V2 migration preparation  
**Target Architecture:** Supabase Edge Function + LiteLLM Gateway (separate Vercel project)

---

## 1. Current AI Implementation Summary

### Files

**Frontend UI:**
- `src/components/clinic/carebridge-ai-panel.tsx` (400 lines)
- `src/routes/_authenticated/ai.tsx` (wrapper route)

**Backend/Edge Function:**
- `supabase/functions/carebridge-ai/index-gemini.ts` (640 lines)
- `supabase/functions/carebridge-ai/model-config-gemini.ts` (11 lines)

**Database:**
- `supabase/migrations/20260922000000_add_ai_conversations.sql`
- Tables: `ai_conversations`, `ai_messages`
- RLS: User can only access their own conversations/messages

### Current Provider

**Model Configuration:** Gemini (Google)
- Primary: `gemini-3.1-flash-lite`
- Environment variable: `GEMINI_API_KEY`
- Fallback models: None configured

---

## 2. AI Code Analysis

### Frontend (`carebridge-ai-panel.tsx`)

**Strengths:**
- Clean React component with good separation of concerns
- Proper conversation management (load/save/select conversations)
- Message history tracking (user + assistant)
- Role-aware assistant labels (Patient/Doctor/Receptionist)
- Markdown rendering for assistant responses
- UI/UX is polished (loading states, error handling, empty states)
- Conversation persistence via Supabase
- Action dropdowns for patients (quick shortcuts)

**What's Good for V2:**
- All of this can remain unchanged
- Conversation UI layer is provider-agnostic
- The `supabase.functions.invoke("carebridge-ai", {body})` call will continue to work after V2
- RLS policies on `ai_conversations` and `ai_messages` are sound

**What Changes in V2:**
- None. Frontend stays exactly as-is. It calls the Edge Function, which delegates to LiteLLM.

---

### Backend Edge Function (`index-gemini.ts`)

**Current Architecture:**
```
Frontend → Supabase Edge Function → Gemini API (direct)
```

**Gemini-Specific Code (to be abstracted in V2):**

1. **Model Configuration:** Line 1, imported from `model-config-gemini.ts`
   - `AI_MODEL_CONFIG.primaryModel = "gemini-3.1-flash-lite"`
   - URL: `generativelanguage.googleapis.com/v1beta/models/...`
   - API key: `GEMINI_API_KEY` environment variable

2. **Request Format (lines 494-545):**
   - Gemini uses `systemInstruction: { parts: [{ text: ... }] }`
   - Content format: `{ role: "model" | "user", parts: [{ text }] }`
   - Tool format: `functionDeclarations` (Gemini-native)
   - Tool calls: `functionCall` fields in response parts

3. **Response Parsing (lines 577-600+):**
   - `completion?.candidates?.[0]?.content`
   - Tool calls extracted: `part?.functionCall`
   - Text extraction: `part?.text`
   - Tool response format: `functionResponse: { id, name, response }`

4. **Error Handling (lines 549-574):**
   - Gemini rate-limit check: `response.status === 429`
   - Error extraction: `errorBody?.error?.message`

5. **Retry Loop (line 531):**
   - Manual loop `for (let turn = 0; turn < 4; turn++)`
   - Hardcoded to 4 iterations

**Reusable Application Logic (stays in Edge Function):**

1. **Authentication & Authorization (lines 419-456):**
   - JWT token extraction from Authorization header
   - `db.auth.getUser(token)` verification
   - Role detection from `profiles` table
   - Role-to-tools mapping (line 457: `patientToolsAllowed = profile.role === "patient"`)

2. **Tool Definitions (lines 50-139):**
   - Tool names, descriptions, parameters are provider-agnostic
   - Currently hardcoded as OpenAI-style format, can adapt

3. **Tool Execution (lines 227-415):**
   - `runTool()` function with actual business logic
   - Database queries for: doctors, appointments, prescriptions, profiles
   - Validation logic (UUID, date format, etc.)
   - Booking confirmation mechanism (XML marker + validation)
   - Error messages and fallbacks

4. **Booking Proposal Extraction (lines 142-173):**
   - Current: XML marker `<carebridge-booking-proposal>JSON</carebridge-booking-proposal>`
   - Location: Line 140, hardcoded in system prompt
   - V2 direction: Replace with structured proposal (see KT section 21)

5. **System Prompt (line 140):**
   - Instructs model on behavior, tool usage, booking flow
   - Role-specific (patient gets tools, others get "general conversation")
   - Contains booking-specific instruction + XML marker

6. **Message History Management (lines 469-491):**
   - Validates history structure
   - Limits to 16 messages
   - Limits content size to 4,000 chars per message
   - Total limit: 24,000 chars

7. **Tools by Role:**
   - Patient: get_doctors, get_available_slots, get_my_appointments, get_my_prescriptions, get_my_profile, book_appointment, cancel_appointment, reschedule_appointment
   - Doctor: (not currently implemented in function tools allowlist, but doctorToolsAllowed could be added)
   - Receptionist: (not currently implemented in function tools allowlist)

**Provider Abstraction Needed in V2:**
- Remove Gemini API URL + fetch logic
- Remove Gemini request/response format conversion
- Remove GEMINI_API_KEY requirement
- Remove Gemini-specific error handling (429 rate limit)
- Remove Gemini's functionDeclarations format
- Keep: Token validation, role checking, tool registry, tool execution, system prompt, history management

---

### Model Configuration (`model-config-gemini.ts`)

**Current:**
```typescript
export const AI_MODEL_CONFIG = {
  provider: "gemini",
  primaryModel: "gemini-3.1-flash-lite",
  fallbackModels: [],
} as const;
```

**Status:**
- Simple, clean separation
- V2: This file will remain but will be updated for LiteLLM reference instead of direct Gemini calls
- Will point to LiteLLM proxy endpoint instead

---

### Database Schema

**Tables (sound, unchanged for V2):**
- `ai_conversations(id, user_id, title, created_at, updated_at)` → keeps conversation history
- `ai_messages(id, conversation_id, user_id, role, content, created_at)` → keeps individual messages

**RLS Policies (sound, unchanged for V2):**
- Users can only see/create/update their own conversations and messages
- Linked via `conversation_id` → parent conversation's `user_id`

**What's Missing:**
- No tables for conversation metadata, model used, feedback, evaluation
- For Assessment 2 RAG + accuracy tracking, will need separate tables (but not part of this audit scope)

---

## 3. Provider-Specific Code to Remove/Abstract

| Code | Location | Action | Reason |
|------|----------|--------|--------|
| Gemini API URL construction | index-gemini.ts:536-539 | Remove in V2 | LiteLLM handles provider routing |
| Request format conversion (user→model) | index-gemini.ts:494-510 | Remove in V2 | LiteLLM accepts OpenAI-compatible format |
| systemInstruction field | index-gemini.ts:540-542 | Keep, adapt | Will become `system` in OpenAI-compatible format |
| functionDeclarations format | index-gemini.ts:518-524 | Remove in V2 | LiteLLM handles format translation |
| Tool response format (functionResponse) | index-gemini.ts:625-634 | Keep, adapt | May need minor adjustment for LiteLLM |
| Response parsing (candidates/content/parts) | index-gemini.ts:577-600 | Remove in V2 | LiteLLM returns OpenAI-compatible format |
| Gemini 429 rate-limit handling | index-gemini.ts:560-566 | Keep, generalize | Will apply to any provider |
| GEMINI_API_KEY env var | index-gemini.ts:427 | Remove in V2 | LiteLLM gateway has provider keys |
| Retry loop (hardcoded 4) | index-gemini.ts:531 | Keep, keep as-is | Can remain, low risk |
| AI_MODEL_CONFIG import | index-gemini.ts:2 | Keep, adapt | Will point to LiteLLM config |

---

## 4. Reusable Application Logic to Keep

**In Edge Function (stays):**

1. ✅ JWT authentication + role detection
2. ✅ Tool definitions (names, descriptions, params)
3. ✅ Tool execution (`runTool()` function + all database operations)
4. ✅ Message history validation + management
5. ✅ System prompt (can update to remove XML marker, add structured proposal)
6. ✅ Error messages + validation logic
7. ✅ Booking confirmation mechanism (will evolve to structured proposal, but logic stays)
8. ✅ Role-to-tools mapping

**In Frontend (stays unchanged):**

1. ✅ Chat UI component
2. ✅ Conversation persistence
3. ✅ Message rendering
4. ✅ User prompts / action buttons
5. ✅ Loading/error states

---

## 5. Old/Obsolete Code to Remove or Isolate

| Item | Current | Status | Action |
|------|---------|--------|--------|
| XML-style booking proposal | `<carebridge-booking-proposal>JSON</carebridge-booking-proposal>` | Obsolete | Replace with structured proposal (V2) |
| Direct Gemini fetch logic | index-gemini.ts:536-615 | To Remove | Replace with LiteLLM call |
| Gemini request format adapter | index-gemini.ts:494-545 | To Remove | LiteLLM handles format |
| Gemini response parser | index-gemini.ts:577-600 | To Remove | LiteLLM returns standard format |
| model-config-gemini.ts (as-is) | Hardcoded "gemini" | To Update | Will reference LiteLLM proxy URL + API key |

---

## 6. Environment & Secrets Audit

### Current Secrets

**In Supabase Edge Function (`index-gemini.ts`):**
- `GEMINI_API_KEY` (line 427) — provider-specific API key
- `SUPABASE_URL` (line 425) — already in use, continues in V2
- `SUPABASE_ANON_KEY` (line 426) — already in use, continues in V2

**In Frontend:**
- `VITE_SUPABASE_URL` — used for Supabase client
- `VITE_SUPABASE_ANON_KEY` — used for Supabase client
- **No provider-specific keys in frontend** ✅ (correct)

### V2 Changes

**Remove from Edge Function:**
- `GEMINI_API_KEY` (will no longer call Gemini directly)

**Add to LiteLLM Gateway (separate Vercel project):**
- `LITELLM_MASTER_KEY` (LiteLLM authentication)
- Provider API keys (Gemini, Fallback model, etc.) — kept in gateway, not frontend

**Edge Function will now use:**
- `LITELLM_GATEWAY_URL` (environment variable pointing to LiteLLM proxy)
- `LITELLM_API_KEY` (Edge Function → LiteLLM authentication)

---

## 7. Dependencies Audit

**Current package.json:**
- No direct dependencies on OpenRouter, LiteLLM, Gemini SDK, or other provider libraries
- The code uses native `fetch()` for Gemini API
- This is good: no bloated provider SDKs

**What's Used:**
- `@supabase/supabase-js` → for database + auth ✅
- `react-markdown` → for AI response rendering ✅
- Standard UI libraries → Radix, Tailwind, shadcn ✅

**Dependencies to Add (in separate LiteLLM project only):**
- `litellm` (Python package, not in this repo)
- Provider SDKs if needed (in gateway only)

**No changes needed to this project's package.json** ✅

---

## 8. Code Quality & Validation

### Pre-Existing Issues Found
- Prettier/CRLF line-ending errors (fixed with `npm run format`)

### Current Build Status
- ✅ **Build:** Passes (1.36s)
- ✅ **Lint:** Passes after formatter fix
- ✅ **TypeScript:** No compilation errors

### Post-Cleanup Validation (after audit prep)
- Will verify build still passes
- Will verify AI chat UI still works
- Will verify conversation persistence unchanged

---

## 9. What's Uncertain / Needs Review

| Item | Current | Question | Action |
|------|---------|----------|--------|
| Doctor/Receptionist AI tools | Not in function allowlist | Should these be enabled in Edge Function now? | Recommend: document, keep disabled until V2 tools phase |
| Tool response validation | Minimal | Should we add stricter validation for tool results? | Low priority for V2 prep; address in phase H (production testing) |
| Conversation history privacy | RLS policies on ai_conversations | Are there any edge cases where a user could see another's conversation? | Policies look sound; no changes needed |
| Booking proposal persistence | Only in message history | Should proposal be stored separately for audit? | Out of scope; can add later if needed |
| Model selection strategy | Hardcoded gemini-3.1-flash-lite | What models will be primary/fallback in V2? | Deferred to LiteLLM gateway configuration |

---

## 10. Recommended Cleanup Actions (This Session)

**DO NOT IMPLEMENT YET** — this is preparation only.

### Phase: Cleanup & Prepare (Current)

Nothing to delete or break. Instead, document and prepare the codebase for transition:

1. ✅ Format code (prettier/CRLF fixes) — **DONE**
2. ✅ Verify build passes — **DONE**
3. Create this audit document — **DONE**
4. Plan Edge Function refactor sequence (see recommendations below)

### Phase: Edge Function Refactor (After LiteLLM Gateway is ready)

1. Create a **`/supabase/functions/carebridge-ai/index-v2.ts`** (new implementation)
2. Keep `index-gemini.ts` as reference/fallback during development
3. Gradually migrate tool logic from old to new
4. Test new Edge Function against real LiteLLM gateway
5. Flip traffic from old to new
6. Delete old implementation

OR

1. Modify `index-gemini.ts` in place, but preserve git history
2. Extract Gemini-specific code into helper file
3. Replace Gemini fetch with LiteLLM call
4. Adapt request/response formats

**Recommendation:** Option 1 (new file) is safer for Lovable integration (preserves history)

---

## 11. What We're NOT Changing

✅ **Clinic Core Functionality:**
- Patient → Doctor → Receptionist workflow
- Appointments, prescriptions, billing, doctor management
- Double-booking protection
- Role promotion RPCs
- Patient profile management

✅ **Database:**
- `profiles`, `doctors`, `appointments`, `prescriptions`, `bills` tables
- RLS policies for clinic data
- Unique constraints, foreign keys

✅ **Authentication:**
- Supabase Auth (email + password + Google)
- Role-based access control via RLS

✅ **Deployment:**
- Vercel frontend (`carebridge-clinic-flow.vercel.app`)
- Supabase project (existing)

✅ **Frontend AI UI:**
- Chat component
- Conversation history
- Message rendering
- Action buttons

---

## 12. Final Recommendations

### Immediate (This Week)

1. ✅ **Audit complete** — determine what's reusable vs. provider-specific
2. Plan LiteLLM gateway project separately
3. Document AI V2 development phases (from KT section 27)

### Before V2 Development Starts

1. Deploy LiteLLM gateway on separate Vercel project
2. Configure primary + fallback models in LiteLLM
3. Test LiteLLM independently (OpenAI-compatible client)
4. Create `LITELLM_GATEWAY_URL` and `LITELLM_API_KEY` environment variables

### During V2 Development

1. **Phase A-C:** Minimal Edge Function, no tools
2. **Phase D-G:** Rebuild tools incrementally against LiteLLM
3. **Phase H:** Production testing, including:
   - Model failure scenarios
   - Rate limits
   - Tool validation
   - Booking confirmation flow
4. **Booking Proposal V2:** Replace XML marker with structured proposal (see KT section 21)

### After V2 is Stable

1. Delete old `index-gemini.ts`
2. Delete `model-config-gemini.ts` (replace with LiteLLM config reference)
3. Clean up `GEMINI_API_KEY` from Supabase secrets
4. Add `LITELLM_GATEWAY_URL` + `LITELLM_API_KEY` to Supabase

---

## Summary Table

| Area | Current | V2 Direction | Impact |
|------|---------|--------------|--------|
| **Provider** | Gemini (direct) | LiteLLM proxy | ⚙️ Abstracted, no frontend change |
| **AI Gateway** | Supabase Edge Function | Same + LiteLLM | ⚙️ Edge Function adds LiteLLM integration |
| **Tools** | Patient only | Patient + Doctor + Receptionist | 📈 Expanded (separate task) |
| **Booking Flow** | XML marker proposal | Structured proposal | 📝 Simplified UX, backend validation |
| **Database** | ai_conversations, ai_messages | Same + RAG tables (Assessment 2) | 📊 Expanded for RAG |
| **Frontend** | Chat UI | Unchanged | ✅ No changes needed |
| **Clinic Core** | Full featured | Unchanged | ✅ No changes needed |
| **Secrets** | GEMINI_API_KEY | LITELLM_GATEWAY_URL, LITELLM_API_KEY | 🔐 Provider abstracted |
| **Build Status** | ✅ Passing | Continues to pass | ✅ No regression expected |

---

## Audit Complete

**Status:** CareBridge project is ready for AI V2 preparation.

**Next Step:** Create separate LiteLLM gateway project (not done here per requirements).

**Owner of This Audit:** Used KT document as source of truth.
