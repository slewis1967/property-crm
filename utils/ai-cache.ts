/**
 * AI response cache backed by a Supabase table `ai_cache`.
 *
 * Strategy: every cached entry has a stable "fingerprint" string derived from
 * the input data that drove the AI call. On read, we look up by (kind, ref_id)
 * and compare fingerprints — if equal, return the cached text; if different,
 * call the generator, store the new text + new fingerprint, and return.
 *
 * Why a fingerprint and not just updated_at: contact briefs depend on the
 * contact AND the latest note/conversation/task timestamps. The fingerprint
 * encodes all of those so cache invalidates correctly when ANY relevant
 * source changes.
 *
 * Server-only — uses the service-role Supabase client.
 *
 * Required table (run once in Supabase SQL editor — see migrations/20260501_ai_cache.sql):
 *   create table ai_cache (
 *     key text primary key,
 *     kind text not null,
 *     ref_id text not null,
 *     fingerprint text not null,
 *     text text not null,
 *     model text default 'claude-opus-4-7',
 *     created_at timestamptz default now(),
 *     updated_at timestamptz default now()
 *   );
 *   create index ai_cache_kind_ref_idx on ai_cache(kind, ref_id);
 *   create index ai_cache_updated_at_idx on ai_cache(updated_at);
 */
import { createHash } from "node:crypto";
import { supabase } from "./supabase";

const DEFAULT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days hard ceiling

export type CacheResult = { text: string; cached: boolean };

export type CacheOptions = {
  /** Logical cache namespace, e.g. "contact-brief", "suburb-brief". */
  kind: string;
  /** Identifier for the cached entry, e.g. a contact id. */
  refId: string;
  /** Anything that uniquely determines the AI input. Hashed to a short string. */
  fingerprintInput: unknown;
  /** Generator that produces the AI text on cache miss. */
  generate: () => Promise<string>;
  /** Optional hard time-to-live override (ms). Defaults to 7 days. */
  maxAgeMs?: number;
};

export function fingerprint(input: unknown): string {
  const json = stableStringify(input);
  return createHash("sha256").update(json).digest("hex").slice(0, 24);
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v as object).sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}

export async function getCachedOrGenerate({
  kind,
  refId,
  fingerprintInput,
  generate,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}: CacheOptions): Promise<CacheResult> {
  const key = `${kind}:${refId}`;
  const fp = fingerprint(fingerprintInput);

  // Try cache
  try {
    const { data: cached } = await supabase
      .from("ai_cache")
      .select("text,fingerprint,updated_at")
      .eq("key", key)
      .maybeSingle();

    if (cached && cached.fingerprint === fp) {
      const ageMs = Date.now() - new Date(cached.updated_at).getTime();
      if (ageMs <= maxAgeMs) {
        return { text: cached.text, cached: true };
      }
    }
  } catch {
    // Cache table might not exist yet — fall through to generate.
  }

  // Generate
  const text = await generate();

  // Store (best-effort; never fail the call because of a write error)
  try {
    await supabase.from("ai_cache").upsert(
      {
        key,
        kind,
        ref_id: refId,
        fingerprint: fp,
        text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* ignored — cache table likely missing; log nothing to keep route output clean */
  }

  return { text, cached: false };
}

/** Invalidate (delete) one cache entry. Useful from refresh buttons. */
export async function invalidateCacheEntry(kind: string, refId: string): Promise<void> {
  try {
    await supabase.from("ai_cache").delete().eq("key", `${kind}:${refId}`);
  } catch {
    /* ignored */
  }
}
