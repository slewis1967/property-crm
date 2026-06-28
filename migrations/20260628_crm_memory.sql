-- ─────────────────────────────────────────────────────────────────────────────
-- crm_memory — the CRM's long-term "brain".
--
-- One table backs four capabilities, distinguished by `kind`:
--   • learning           — agents record what worked/failed, recall it next time
--   • knowledge          — Sean-curated business KB (builder intel, playbooks, SOPs)
--   • contact_memory     — running insights attached to a contact
--   • opportunity_memory — running insights attached to a deal
--   • playbook           — reusable procedures the AI can follow
--
-- Source of truth lives HERE (Supabase) because the cloud CRM can always reach
-- it. A local sync job (scripts/obsidian-memory-sync.mjs) mirrors rows two-way
-- to the NextKey_CRM_Brain Obsidian vault as markdown + [[wikilinks]].
--
-- Recall is hybrid: Postgres full-text search always works; semantic vector
-- search activates automatically once embeddings are populated (gated behind an
-- embeddings API key on the app side — see utils/embeddings.ts).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm;
create extension if not exists vector;     -- pgvector; harmless if already present

-- ── 0. Immutable FTS builder ────────────────────────────────────────────────
-- A GENERATED column requires an IMMUTABLE expression. to_tsvector with a named
-- config ('english') is only STABLE — even 'english'::regconfig is, because the
-- name→OID cast is a catalog lookup. We wrap it in a function we DECLARE
-- immutable (the config is hardcoded, so it's safe to assert) and call that from
-- the generated column. This is the standard Postgres workaround.
create or replace function public.crm_memory_fts(
  p_title text, p_body text, p_tags text[]
) returns tsvector language sql immutable as $$
  select to_tsvector(
    'english',
    coalesce(p_title, '') || ' ' || coalesce(p_body, '') || ' ' ||
    coalesce(array_to_string(p_tags, ' '), '')
  );
$$;

-- ── 1. The memory store ──────────────────────────────────────────────────────
create table if not exists public.crm_memory (
  id            uuid primary key default gen_random_uuid(),
  -- Stable kebab id used for the markdown filename AND [[wikilink]] target.
  -- Generated app-side from the title; unique so links resolve 1:1.
  slug          text unique not null,
  kind          text not null default 'learning',
  title         text not null,
  body          text not null default '',          -- markdown
  -- Who authored it: an agent name ('veteran-advisor', 'deal-analyser',
  -- 'voice'), a feature, or 'human' when Sean edits in Obsidian.
  source        text default 'human',
  -- Optional link to a CRM record so contact/deal memory surfaces in context.
  entity_type   text,                              -- contact | opportunity | property | builder
  entity_id     text,
  tags          text[] default '{}',
  -- slugs of related memories → rendered as [[wikilinks]] in Obsidian.
  links         text[] default '{}',
  -- Trust + reinforcement signals. usefulness is nudged up when a recalled
  -- memory leads to a good outcome, down when it misleads.
  confidence    real    default 0.5,               -- 0..1
  usefulness    real    default 0,                 -- signed, accumulates
  usage_count   int     default 0,
  last_used_at  timestamptz,
  -- Semantic recall. Nullable: rows are searchable via FTS even with no vector.
  -- 1536 dims = OpenAI text-embedding-3-small. Change the migration + util
  -- together if you swap embedding models.
  embedding     vector(1536),
  -- Built by the IMMUTABLE wrapper above (see § 0) so the GENERATED column is
  -- accepted. Searchable via .textSearch('fts', …) in utils/memory.ts.
  fts           tsvector generated always as (
                  public.crm_memory_fts(title, body, tags)
                ) stored,
  archived      boolean default false,
  -- Obsidian mirror bookkeeping.
  obsidian_path text,                              -- relative path inside the vault
  synced_at     timestamptz,                       -- last successful mirror in either direction
  created_by    text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists crm_memory_fts_idx       on public.crm_memory using gin (fts);
create index if not exists crm_memory_tags_idx      on public.crm_memory using gin (tags);
create index if not exists crm_memory_title_trgm_idx on public.crm_memory using gin (title gin_trgm_ops);
create index if not exists crm_memory_kind_idx      on public.crm_memory (kind);
create index if not exists crm_memory_entity_idx    on public.crm_memory (entity_type, entity_id);
create index if not exists crm_memory_updated_idx   on public.crm_memory (updated_at desc);
-- ivfflat needs ANALYZE + rows to be useful; safe to create empty.
create index if not exists crm_memory_embedding_idx on public.crm_memory
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- keep updated_at honest
create or replace function public.touch_crm_memory() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_crm_memory on public.crm_memory;
create trigger trg_touch_crm_memory
  before update on public.crm_memory
  for each row execute function public.touch_crm_memory();

-- ── 2. Recall usage log — which memories actually get used, and for what ─────
-- Powers reinforcement (usefulness) and lets us prune dead weight.
create table if not exists public.crm_memory_usage (
  id          uuid primary key default gen_random_uuid(),
  memory_id   uuid references public.crm_memory(id) on delete cascade,
  feature     text,            -- which AI feature recalled it
  query       text,            -- the recall query (truncated app-side)
  score       real,            -- match score at recall time
  created_at  timestamptz default now()
);
create index if not exists crm_memory_usage_mem_idx on public.crm_memory_usage (memory_id);

-- ── 3. Hybrid match RPC — cosine vector search with optional filters ────────
-- Returns rows ordered by similarity. Callable from the service-role client.
-- When the app has no embedding for the query it skips this and uses FTS.
create or replace function public.match_crm_memory(
  query_embedding  vector(1536),
  match_count      int default 8,
  filter_kind      text default null,
  filter_entity_type text default null,
  filter_entity_id text default null
)
returns table (
  id uuid, slug text, kind text, title text, body text, source text,
  entity_type text, entity_id text, tags text[], links text[],
  confidence real, usefulness real, similarity real
)
language sql stable as $$
  select m.id, m.slug, m.kind, m.title, m.body, m.source,
         m.entity_type, m.entity_id, m.tags, m.links,
         m.confidence, m.usefulness,
         1 - (m.embedding <=> query_embedding) as similarity
  from public.crm_memory m
  where m.archived = false
    and m.embedding is not null
    and (filter_kind        is null or m.kind = filter_kind)
    and (filter_entity_type is null or m.entity_type = filter_entity_type)
    and (filter_entity_id   is null or m.entity_id = filter_entity_id)
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
