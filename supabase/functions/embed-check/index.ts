// Check function for carebridge-rag/scripts/check-gte.mjs: returns gte-small embeddings from the
// Edge Runtime so they can be compared with the locally computed document embeddings. Only callers
// holding the service role or a secret key are allowed. Not kept deployed; deploy it with
// `supabase functions deploy embed-check --no-verify-jwt` for a check, then delete it again.
import { embedGte } from "../carebridge-ai-v2/embed-gte.ts";

const MAX_TEXTS = 20;
const MAX_TEXT_LENGTH = 2000;

function allowedKeys(): string[] {
  const keys = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""];
  try {
    keys.push(...Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>));
  } catch {
    // SUPABASE_SECRET_KEYS is optional.
  }
  return keys.filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });

  const provided = req.headers.get("apikey") ?? req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!provided || !allowedKeys().includes(provided)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const texts = body?.texts;
  if (
    !Array.isArray(texts) ||
    !texts.length ||
    texts.length > MAX_TEXTS ||
    !texts.every((t) => typeof t === "string" && t.length <= MAX_TEXT_LENGTH)
  ) {
    return Response.json({ error: `texts must be 1 to ${MAX_TEXTS} strings.` }, { status: 400 });
  }

  const embeddings: number[][] = [];
  for (const text of texts) {
    const result = await embedGte(text);
    if (!result.ok) return Response.json({ error: "Embedding failed.", detail: result.detail }, { status: 500 });
    embeddings.push(result.embedding);
  }
  return Response.json({ embeddings });
});
