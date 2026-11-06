# Assessment 4 — Langfuse tracing

## Status

`carebridge-ai-v3` posts optional agentic RAG traces via `langfuse.ts` when secrets exist.

| Env (Supabase Edge secrets) | Purpose |
|---|---|
| `LANGFUSE_PUBLIC_KEY` | Langfuse project public key |
| `LANGFUSE_SECRET_KEY` | Langfuse project secret key |
| `LANGFUSE_HOST` (optional) | Defaults to `https://cloud.langfuse.com` |

Without those secrets the helper no-ops. Chat path never fails on missing Langfuse.

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

## Failure cases to review in Langfuse

1. **Unexpected refuse** — support judge `supported=false` on an in-corpus FAQ question (quota / weak retrieve).
2. **Plan fallback** — `plan_source=fallback` when the planner times out; single-query retrieve only.
3. **Empty hops** — hybrid retrieve returns 0 candidates below the 0.82 gte cutoff.
4. **False answer** — refused=false on an out-of-corpus question (hallucination risk; should be rare with fail-closed support).

## Setup (free cloud)

1. Create a free project at [cloud.langfuse.com](https://cloud.langfuse.com).
2. Copy public + secret keys.
3. `npx supabase secrets set LANGFUSE_PUBLIC_KEY=... LANGFUSE_SECRET_KEY=... --project-ref pfvmpvbwdavusvwbddrd`
4. Redeploy: `npx supabase functions deploy carebridge-ai-v3 --project-ref pfvmpvbwdavusvwbddrd --yes`
5. Ask one refuse + one multi-hop question in `/ai`; confirm traces in Langfuse UI.

Office machine note (2026-11-06 afternoon):

- Edge code (`langfuse.ts`) is deployed with `carebridge-ai-v3`.
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` are **not** in local `.env` files and **not** in Supabase project secrets yet.
- Free Langfuse Cloud requires an interactive sign-in to create a project; the office agent cannot mint keys without Shahriar’s Langfuse account.
- **Blocker:** paste free-cloud public + secret keys (or create the project and share keys via a secure channel). Then:

```bat
npx supabase secrets set LANGFUSE_PUBLIC_KEY=pk-lf-... LANGFUSE_SECRET_KEY=sk-lf-... --project-ref pfvmpvbwdavusvwbddrd
npx supabase functions deploy carebridge-ai-v3 --project-ref pfvmpvbwdavusvwbddrd --yes
```

After that, ask one refuse + one multi-hop question on `/ai` and confirm traces in the Langfuse UI.
