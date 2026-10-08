# CareBridge V2 Quick Reference

**TL;DR:** AI V2 preparation audit complete. No breaking changes. Project ready for LiteLLM integration.

---

## Current State (v1)

```
CareBridge Frontend (Vercel)
         ↓
Supabase Edge Function (Deno)
         ↓
Gemini API (direct call)
         ↓
Gemini 3.1 Flash Lite
```

**Status:** Working, but provider-locked.

---

## Target State (v2)

```
CareBridge Frontend (Vercel #1) — UNCHANGED
         ↓
Supabase Edge Function (Deno)   — REFACTORED
         ↓
LiteLLM Proxy (Vercel #2)        — NEW
         ↓
┌─────────┬──────────┬────────────┐
Primary  Fallback1  Fallback2
Model    Model      Model
```

**Benefit:** Provider abstraction, flexible model routing, failover capability.

---

## Files to Know

| File | Lines | Purpose | V2 Status |
|------|-------|---------|-----------|
| `src/components/clinic/carebridge-ai-panel.tsx` | 400 | Chat UI | ✅ Keep as-is |
| `supabase/functions/carebridge-ai/index-gemini.ts` | 640 | Edge Function | 🔄 Refactor (Phase B) |
| `supabase/functions/carebridge-ai/model-config-gemini.ts` | 11 | Config | 🔄 Update (Phase B) |
| `supabase/migrations/.../add_ai_conversations.sql` | 60 | DB schema | ✅ Keep as-is |

---

## What Was Audited

✅ 4 AI files  
✅ 80+ supporting files  
✅ 640 lines of Edge Function code  
✅ Tool execution logic  
✅ Authentication & RLS  
✅ Booking confirmation mechanism  
✅ Environment variables  
✅ Dependencies  

---

## Key Findings

| Finding | Impact | Action |
|---------|--------|--------|
| Frontend is provider-agnostic | No changes needed | None |
| Tool logic is reusable | Can move to new Edge Function | Keep in Phase B |
| Gemini calls are encapsulated | Easy to replace | Remove in Phase B |
| No provider keys in frontend | Security ✓ | Keep as-is |
| Build passes | No regression | Continue |
| RLS is sound | Auth works | Keep as-is |

---

## Changes Made

### Whitespace Fix
```bash
npm run format
# Fixed 100+ CRLF line ending issues
# No functional changes
```

### Documents Added
```
AI_V2_AUDIT.md               (39 sections, detailed breakdown)
AI_V2_CLEANUP_REPORT.md      (status + recommendations)
V2_MIGRATION_CHECKLIST.md    (phase-by-phase guide)
AUDIT_COMPLETE.md            (this summary)
QUICK_REFERENCE.md           (super quick reference)
```

### Nothing Deleted
```
✅ index-gemini.ts kept (reference for V2)
✅ model-config-gemini.ts kept
✅ All clinic code kept
✅ All frontend code kept
✅ All DB migrations kept
```

---

## V2 Phases at a Glance

| Phase | Task | Days | Status |
|-------|------|------|--------|
| A | LiteLLM Infrastructure | 2-3 | 🔲 Not started |
| B | Minimal Edge Function | 1-2 | 🔲 Not started |
| C | Tool Framework | 1 | 🔲 Not started |
| D | Patient Tools | 2-3 | 🔲 Not started |
| E | Booking Proposal V2 | 2 | 🔲 Not started |
| F | Cancel/Reschedule | 1-2 | 🔲 Not started |
| G | Doctor/Receptionist Tools | 3-4 | 🔲 Not started |
| H | Production Testing | 2-3 | 🔲 Not started |

---

## Assessment 2 Tasks (Parallel)

- RAG system (5k+ records, evaluation)
- Classification (≥70% accuracy)
- Automations (reminders, waitlist)
- Tests (unit + E2E)
- UI/UX polish
- Submission (due Wed Sep 30)

---

## What Stays Untouched

✅ Clinic workflow (patient → doctor → receptionist)  
✅ Appointments, prescriptions, billing  
✅ Doctor management  
✅ RLS & authentication  
✅ Frontend pages & routes  
✅ Database schema  
✅ Vercel deployment  
✅ Lovable integration  

---

## What Gets Replaced

🔄 Gemini API calls → LiteLLM proxy  
🔄 Gemini request format → OpenAI-compatible  
🔄 Gemini response parser → Standard format  
🔄 model-config-gemini.ts → LiteLLM config  
🔄 GEMINI_API_KEY → LITELLM_GATEWAY_URL + LITELLM_API_KEY  

---

## Pre-Existing Issues

| Issue | Severity | Status |
|-------|----------|--------|
| TypeScript `any` types | Low | Pre-existing; will be fixed in V2 refactor |
| CRLF line endings | Low | ✅ Fixed with prettier |

---

## Build Status

```
Before:  ✅ Build: Pass  ❌ Format: CRLF errors
After:   ✅ Build: Pass  ✅ Format: Fixed
Changes: Whitespace only (no functional changes)
```

---

## Next Steps

### Week 1 (This Week)
1. Review `kt.md` (architecture)
2. Review `AI_V2_AUDIT.md` (what exists)
3. Create LiteLLM gateway (separate project)
4. Configure LiteLLM with fallbacks

### Week 2
5. Deploy LiteLLM to Vercel #2
6. Phase B: Minimal Edge Function
7. Phase C: Tool framework
8. Test basic conversation

### Week 3-4
9. Phase D-G: Rebuild tools
10. Phase H: Production testing
11. Assessment 2: RAG + accuracy + automations + tests

### Final (By Sep 30)
12. Polish UI/UX
13. Write documentation
14. Submit on Dev Control Tower

---

## Read These First

1. **`kt.md`** — Architecture blueprint (sections 13-19)
2. **`AI_V2_AUDIT.md`** — Technical details (sections 1-5)
3. **`V2_MIGRATION_CHECKLIST.md`** — Phase-by-phase guide

---

## Key Contacts

- **Architecture:** `kt.md`
- **Current Code:** `AI_V2_AUDIT.md`
- **Status Report:** `AI_V2_CLEANUP_REPORT.md`
- **Implementation Plan:** `V2_MIGRATION_CHECKLIST.md`
- **Live App:** https://carebridge-clinic-flow.vercel.app
- **GitHub:** https://github.com/shahriar-rashid-13/carebridge-clinic-flow

---

## Confidence

✅✅✅ **HIGH**

- Audit complete
- No regressions
- Clear path forward
- Documentation comprehensive
- Build verified passing

---

**Status: READY FOR V2 DEVELOPMENT 🚀**
