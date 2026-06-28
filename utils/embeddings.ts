/**
 * Optional embeddings provider for semantic memory recall.
 *
 * OpenRouter (the CRM's chat transport) does NOT expose an embeddings endpoint,
 * so semantic recall needs a dedicated embeddings key. This module is
 * deliberately *optional*: if no key is configured, embed() returns null and
 * the memory layer falls back to Postgres full-text search. Nothing breaks —
 * recall is just lexical instead of semantic until a key is added.
 *
 * Configure (Netlify env) to turn on semantic recall:
 *   EMBEDDINGS_API_KEY   — an OpenAI API key (sk-...). Required to enable.
 *   EMBEDDINGS_BASE_URL  — optional; defaults to OpenAI. Point at any
 *                          OpenAI-compatible embeddings endpoint if preferred.
 *   EMBEDDINGS_MODEL     — optional; defaults to text-embedding-3-small (1536d).
 *
 * NOTE: the vector(1536) dimension in migrations/20260628_crm_memory.sql is tied
 * to text-embedding-3-small. If you change EMBEDDINGS_MODEL to one with a
 * different dimension, update the migration to match.
 */
import OpenAI from "openai";

const apiKey = process.env.EMBEDDINGS_API_KEY;
const model = process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small";

const client = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: process.env.EMBEDDINGS_BASE_URL, // undefined → OpenAI default
    })
  : null;

/** True when semantic recall is available. */
export function embeddingsEnabled(): boolean {
  return client !== null;
}

/**
 * Embed a single string. Returns a 1536-dim vector, or null if embeddings are
 * disabled or the call fails (callers fall back to FTS — never throw on the
 * write/recall hot path just because embeddings are down).
 */
export async function embed(text: string): Promise<number[] | null> {
  if (!client) return null;
  const input = text.trim().slice(0, 8000); // generous cap; embeddings are cheap
  if (!input) return null;
  try {
    const res = await client.embeddings.create({ model, input });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("[embeddings] embed failed, falling back to FTS:", err);
    return null;
  }
}
