// Query embeddings with the gte-small model built into the Supabase Edge Runtime. Must match the
// documents in rag_documents.embedding_gte, which carebridge-rag/scripts/embed-gte.mjs embeds with
// Supabase/gte-small, mean pooling, and normalisation.
declare const Supabase: {
  ai: { Session: new (model: string) => { run(input: string, options: Record<string, unknown>): Promise<unknown> } };
};

export const GTE_DIMENSIONS = 384;

export type GteResult = { ok: true; embedding: number[] } | { ok: false; detail: string };

export async function embedGte(text: string): Promise<GteResult> {
  try {
    // The runtime caches the loaded model, so a session per call is cheap.
    const session = new Supabase.ai.Session("gte-small");
    const output = await session.run(text, { mean_pool: true, normalize: true });
    const embedding = Array.from(output as ArrayLike<number>);
    if (embedding.length !== GTE_DIMENSIONS) {
      return { ok: false, detail: `gte-small returned ${embedding.length} dimensions` };
    }
    return { ok: true, embedding };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
