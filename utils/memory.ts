/**
 * The CRM's memory layer — a thin, well-behaved API over the crm_memory table.
 *
 * Any AI feature gets smarter by doing two things:
 *   1. recall() relevant memories before generating, and fold them into context.
 *   2. remember() what it learned / what the outcome was, afterwards.
 *
 * Recall is hybrid: semantic (pgvector) when an embeddings key is configured,
 * otherwise Postgres full-text search. Either way callers get the same shape
 * back, so wiring a feature in never depends on whether embeddings are on.
 *
 * Server-only (imports the service-role Supabase client).
 */
import { getDb } from "./db";
import { embed, embeddingsEnabled } from "./embeddings";

// Single data-access chokepoint (see utils/db.ts). Same service client today;
// becomes org-scoped in tenancy Phase 1 without touching the call sites below.
const supabase = getDb();

export type MemoryKind =
  | "learning"
  | "knowledge"
  | "contact_memory"
  | "opportunity_memory"
  | "playbook";

export type Memory = {
  id: string;
  slug: string;
  kind: MemoryKind | string;
  title: string;
  body: string;
  source: string | null;
  entity_type: string | null;
  entity_id: string | null;
  tags: string[];
  links: string[];
  confidence: number;
  usefulness: number;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RememberInput = {
  kind?: MemoryKind;
  title: string;
  body?: string;
  source?: string; // agent/feature name, or 'human'
  entityType?: string;
  entityId?: string;
  tags?: string[];
  links?: string[]; // slugs of related memories
  confidence?: number; // 0..1
  createdBy?: string;
  /** If a memory with this slug exists, update it instead of inserting. */
  slug?: string;
};

export type RecallOptions = {
  kind?: MemoryKind;
  entityType?: string;
  entityId?: string;
  limit?: number;
  /** Feature name for the usage log (powers reinforcement + pruning). */
  feature?: string;
};

export type RecalledMemory = Memory & { score: number };

/** kebab-case slug, ascii-only, collapsed dashes. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "memory";
}

/** Find a free slug by appending -2, -3, … if the base is taken. */
async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let n = 2; n < 1000; n++) {
    const { data } = await supabase
      .from("crm_memory")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    slug = `${base}-${n}`;
  }
  // Astronomically unlikely; fall back to a time-free disambiguator.
  return `${base}-${base.length}`;
}

/**
 * Store (or update) a memory. Embeds the text if embeddings are enabled.
 * Pass `slug` to upsert an existing memory (used by the Obsidian sync push and
 * by agents that maintain a single evolving note per topic).
 */
export async function remember(input: RememberInput): Promise<Memory> {
  const title = input.title.trim();
  const body = (input.body ?? "").trim();

  // Embedding is best-effort; null → row is still FTS-searchable.
  const vector = embeddingsEnabled() ? await embed(`${title}\n\n${body}`) : null;

  const base: Record<string, unknown> = {
    kind: input.kind ?? "learning",
    title,
    body,
    source: input.source ?? "human",
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    tags: input.tags ?? [],
    links: input.links ?? [],
    confidence: input.confidence ?? 0.5,
    created_by: input.createdBy ?? input.source ?? "human",
  };
  if (vector) base.embedding = vector;

  // Upsert path: caller supplied a slug to overwrite.
  if (input.slug) {
    const existing = await supabase
      .from("crm_memory")
      .select("id")
      .eq("slug", input.slug)
      .maybeSingle();

    if (existing.data) {
      const { data, error } = await supabase
        .from("crm_memory")
        .update(base)
        .eq("slug", input.slug)
        .select("*")
        .single();
      if (error) throw new Error(`remember(update): ${error.message}`);
      return data as Memory;
    }
    base.slug = input.slug;
  } else {
    base.slug = await uniqueSlug(slugify(title));
  }

  const { data, error } = await supabase
    .from("crm_memory")
    .insert(base)
    .select("*")
    .single();
  if (error) throw new Error(`remember(insert): ${error.message}`);
  return data as Memory;
}

/**
 * Retrieve the most relevant memories for a query. Semantic when possible,
 * lexical (FTS) otherwise. Logs usage and bumps usage_count so the system
 * learns which memories earn their keep.
 */
export async function recall(
  query: string,
  opts: RecallOptions = {},
): Promise<RecalledMemory[]> {
  const limit = opts.limit ?? 8;
  const q = query.trim();
  if (!q) return [];

  let rows: RecalledMemory[] = [];

  const vector = embeddingsEnabled() ? await embed(q) : null;
  if (vector) {
    const { data, error } = await supabase.rpc("match_crm_memory", {
      query_embedding: vector,
      match_count: limit,
      filter_kind: opts.kind ?? null,
      filter_entity_type: opts.entityType ?? null,
      filter_entity_id: opts.entityId ?? null,
    });
    if (error) throw new Error(`recall(vector): ${error.message}`);
    rows = (data ?? []).map((r: Memory & { similarity: number }) => ({
      ...r,
      score: r.similarity,
    }));
  } else {
    // Lexical fallback: Postgres websearch over the generated tsvector.
    let query2 = supabase
      .from("crm_memory")
      .select("*")
      .eq("archived", false)
      .textSearch("fts", q, { type: "websearch" })
      .limit(limit);
    if (opts.kind) query2 = query2.eq("kind", opts.kind);
    if (opts.entityType) query2 = query2.eq("entity_type", opts.entityType);
    if (opts.entityId) query2 = query2.eq("entity_id", opts.entityId);
    const { data, error } = await query2;
    if (error) throw new Error(`recall(fts): ${error.message}`);
    rows = (data ?? []).map((r: Memory) => ({ ...r, score: 0 }));
  }

  // Fire-and-forget bookkeeping; never block recall on logging.
  void logUsage(rows, q, opts.feature);
  return rows;
}

/** Record that these memories were recalled, and bump their usage counters. */
async function logUsage(
  rows: RecalledMemory[],
  query: string,
  feature?: string,
): Promise<void> {
  if (!rows.length) return;
  const now = new Date().toISOString();
  try {
    await supabase.from("crm_memory_usage").insert(
      rows.map((r) => ({
        memory_id: r.id,
        feature: feature ?? null,
        query: query.slice(0, 500),
        score: r.score,
      })),
    );
    // usage_count++ / last_used_at per recalled memory.
    await Promise.all(
      rows.map((r) =>
        supabase
          .from("crm_memory")
          .update({ usage_count: (r.usage_count ?? 0) + 1, last_used_at: now })
          .eq("id", r.id),
      ),
    );
  } catch (err) {
    console.error("[memory] logUsage failed (non-fatal):", err);
  }
}

/**
 * Reinforcement signal. Nudge a memory's usefulness up (it helped) or down
 * (it misled). Bound to [-5, 5] so one bad week can't bury a good memory.
 */
export async function reinforce(id: string, delta: number): Promise<void> {
  const { data } = await supabase
    .from("crm_memory")
    .select("usefulness")
    .eq("id", id)
    .maybeSingle();
  const current = (data?.usefulness as number) ?? 0;
  const next = Math.max(-5, Math.min(5, current + delta));
  const { error } = await supabase
    .from("crm_memory")
    .update({ usefulness: next })
    .eq("id", id);
  if (error) throw new Error(`reinforce: ${error.message}`);
}

/** Fetch one memory by slug or id. */
export async function getMemory(slugOrId: string): Promise<Memory | null> {
  const col = /^[0-9a-f-]{36}$/i.test(slugOrId) ? "id" : "slug";
  const { data } = await supabase
    .from("crm_memory")
    .select("*")
    .eq(col, slugOrId)
    .maybeSingle();
  return (data as Memory) ?? null;
}
