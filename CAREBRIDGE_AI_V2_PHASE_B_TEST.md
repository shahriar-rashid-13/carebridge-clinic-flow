# CareBridge AI V2 Phase B — Testing Guide

## Overview

New Edge Function: `supabase/functions/carebridge-ai-v2/index.ts`

Does: authenticate user, load role, call LiteLLM, return plain text response.

## Environment Setup

The new function needs:

```bash
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
LITELLM_BASE_URL=https://<gateway-url>
LITELLM_API_KEY=<gateway-api-key>
```

Local testing: create `.env.local` in project root or set in terminal before running `npm run dev`.

## Test Cases

### 1. Valid patient request (SUCCESS)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <patient-jwt>" \
  -d '{"message":"What appointments do I have?"}'
```

Expected: 200, `{ "ok": true, "reply": "..." }`

### 2. Valid doctor request (SUCCESS)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <doctor-jwt>" \
  -d '{"message":"Tell me about my schedule"}'
```

Expected: 200, `{ "ok": true, "reply": "..." }`

### 3. Valid receptionist request (SUCCESS)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <receptionist-jwt>" \
  -d '{"message":"How many patients today?"}'
```

Expected: 200, `{ "ok": true, "reply": "..." }`

### 4. With message history (SUCCESS)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <patient-jwt>" \
  -d '{
    "message":"And my prescriptions?",
    "messages":[
      {"role":"user","content":"What appointments do I have?"},
      {"role":"assistant","content":"You have one appointment tomorrow."}
    ]
  }'
```

Expected: 200, includes previous messages in context.

### 5. Invalid token (AUTH FAIL)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid-token" \
  -d '{"message":"hello"}'
```

Expected: 401, `{ "ok": false, "error": "Invalid token" }`

### 6. Missing authorization (AUTH FAIL)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}'
```

Expected: 401, `{ "ok": false, "error": "Missing or invalid authorization" }`

### 7. Missing message (VALIDATION FAIL)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <patient-jwt>" \
  -d '{}'
```

Expected: 400, `{ "ok": false, "error": "message is required..." }`

### 8. Empty message (VALIDATION FAIL)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <patient-jwt>" \
  -d '{"message":""}'
```

Expected: 400, `{ "ok": false, "error": "message cannot be empty" }`

### 9. Message too long (VALIDATION FAIL)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <patient-jwt>" \
  -d '{"message":"<4001+ character string>"}'
```

Expected: 400, `{ "ok": false, "error": "message exceeds 4000 characters" }`

### 10. Invalid message history format (VALIDATION FAIL)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <patient-jwt>" \
  -d '{"message":"hi","messages":"not-an-array"}'
```

Expected: 400, `{ "ok": false, "error": "messages must be an array" }`

### 11. Invalid role in profile (AUTHZ FAIL)

Test with a user whose profile has `role = 'invalid'`:

Expected: 403, `{ "ok": false, "error": "Profile not found or invalid role" }`

### 12. Missing profile (AUTHZ FAIL)

Test with a valid auth token whose profile doesn't exist (edge case):

Expected: 403, `{ "ok": false, "error": "Profile not found or invalid role" }`

### 13. LiteLLM unavailable (GATEWAY FAIL)

Set `LITELLM_BASE_URL` to an unreachable URL:

Expected: 502, `{ "ok": false, "error": "Failed to call gateway: ..." }`

### 14. LiteLLM auth fail (GATEWAY AUTH FAIL)

Set `LITELLM_API_KEY` to an invalid key:

Expected: 502, `{ "ok": false, "error": "Gateway authentication failed" }` (or 401 from gateway)

### 15. LiteLLM rate limited (GATEWAY RATE LIMIT)

Trigger 429 from gateway:

Expected: 502, `{ "ok": false, "error": "Gateway temporarily rate-limited" }`

### 16. Invalid JSON in request body (PARSE FAIL)

```bash
curl -X POST http://localhost:8000/functions/v1/carebridge-ai-v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <patient-jwt>" \
  -d 'not-json'
```

Expected: 400, `{ "ok": false, "error": "Invalid JSON" }`

### 17. OPTIONS request (CORS PREFLIGHT)

```bash
curl -X OPTIONS http://localhost:8000/functions/v1/carebridge-ai-v2
```

Expected: 204, headers `Access-Control-Allow-*`.

### 18. Unsupported method (METHOD NOT ALLOWED)

```bash
curl -X GET http://localhost:8000/functions/v1/carebridge-ai-v2
```

Expected: 405, `{ "ok": false, "error": "Method not allowed" }`

## Obtaining Test Tokens

### Via Supabase Auth API (local testing):

1. Create test user in Supabase Dashboard or via auth API.
2. Get `session.access_token` from auth response.
3. Verify `profiles.role` is set to `patient`, `doctor`, or `receptionist`.

### Via the CareBridge app:

1. Sign in to http://localhost:8080/login.
2. Open browser DevTools → Console.
3. Run: `await supabase.auth.getSession().then(s => console.log(s.data.session.access_token))`.
4. Copy the token.

## Expected System Prompts

The Edge Function includes role-aware system instructions:

- **Patient:** "...You can help with appointments, prescriptions, and health questions..."
- **Doctor:** "...You can help with consultations and patient information..."
- **Receptionist:** "...You can help with appointments and clinic operations..."

Verify the model output respects these when you test with different roles.

## Integration Test (End-to-End)

Once LiteLLM gateway is deployed and accessible:

1. Deploy `carebridge-ai-v2` to Supabase.
2. Set `LITELLM_BASE_URL` and `LITELLM_API_KEY` in Supabase Edge Function secrets.
3. Sign into the CareBridge app as each role.
4. Test the current AI panel (still uses old Edge Function).
5. Modify `carebridge-ai-panel.tsx` to call the new function (Phase C or later).

## What NOT to test in Phase B

- Database tools (get_doctors, get_available_slots, book_appointment, etc.)
- Tool calling or function execution.
- Structured booking proposals.
- Doctor/receptionist specific actions.
- Persistent conversation state (frontend already does this).

These belong to Phase C onward.

## Logs and Debugging

The Edge Function logs to Supabase Edge Function logs. Check:

```
Supabase Dashboard → Project → Logs → Edge Functions → carebridge-ai-v2
```

The function does NOT log auth tokens or API keys (security).

---

**Phase B Success Criteria:**

✅ Authenticated user (valid JWT)  
✅ Role detected from profiles  
✅ Request sent to LiteLLM gateway  
✅ Response received and returned  
✅ Old `carebridge-ai` function untouched  
✅ No tools implemented yet  
✅ No secrets exposed  
✅ Proper error handling  
✅ CORS configured  
