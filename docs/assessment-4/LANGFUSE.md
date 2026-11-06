# Assessment 4 — Langfuse tracing

## Status

`carebridge-ai-v3` posts optional agentic RAG traces via `langfuse.ts` when secrets exist.

**CareBridge project region: Japan** — UI and ingest host is  
`https://jp.cloud.langfuse.com`  
**not** `https://cloud.langfuse.com` (US). Keys from the JP project must be paired with the JP host.

| Env (Supabase Edge secrets) | Purpose |
|---|---|
| `LANGFUSE_PUBLIC_KEY` | JP project public key (Manage API keys) |
| `LANGFUSE_SECRET_KEY` | JP project secret key |
| `LANGFUSE_BASE_URL` | **Required for JP:** `https://jp.cloud.langfuse.com` |
| `LANGFUSE_HOST` | Alias for base URL (optional; `BASE_URL` preferred) |

Code default host is now the JP URL. If `LANGFUSE_BASE_URL` / `LANGFUSE_HOST` point at the US cloud, Tracing stays empty for JP keys.

Without public/secret keys the helper no-ops. Chat path never fails on missing Langfuse.

## What is traced

Each `search_knowledge` / agentic turn records:

- question (truncated)
- plan source + sub-queries
- hop count
- supported / refused
- support reason
- candidate / result counts
- latency ms

Tags: `carebridge-ai-v3`, `agentic-rag`, `refuse`|`answer`, `multi-hop`|`single`.

Ingest path: `POST {LANGFUSE_BASE_URL}/api/public/ingestion`

## Setup (JP free cloud)

1. Open [https://jp.cloud.langfuse.com](https://jp.cloud.langfuse.com) and create/select the CareBridge project.
2. Copy **public + secret** keys from Manage API keys (same JP project).
3. Set Edge secrets (values never committed):

```bat
npx supabase secrets set LANGFUSE_BASE_URL=https://jp.cloud.langfuse.com LANGFUSE_PUBLIC_KEY=pk-lf-... LANGFUSE_SECRET_KEY=sk-lf-... --project-ref pfvmpvbwdavusvwbddrd
npx supabase functions deploy carebridge-ai-v3 --project-ref pfvmpvbwdavusvwbddrd --yes
```

4. Ask one knowledge question + one refuse on `/ai` (must hit `search_knowledge`).
5. Refresh **Tracing** on the JP UI.

## Failure cases to review in Langfuse

1. **Unexpected refuse** — support judge `supported=false` on an in-corpus FAQ question.
2. **Plan fallback** — `plan_source=fallback` when the planner times out.
3. **Empty hops** — hybrid retrieve returns 0 candidates below the 0.82 gte cutoff.
4. **False answer** — refused=false on an out-of-corpus question.
5. **Region mismatch** — keys from JP but host still US (or the reverse).

## Safe Edge logs (no key values)

Look for:

- `langfuse enabled host=https://jp.cloud.langfuse.com`
- `langfuse ingest HTTP 207 host=...` (or `200`) on success
- `langfuse ingest HTTP 4xx/5xx` or `langfuse ingest failed` on error
