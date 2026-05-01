-- AI response cache.
-- Stores the result of every Claude call so we don't re-generate on cache hits.
-- See utils/ai-cache.ts for read/write logic.

create table if not exists public.ai_cache (
  key          text primary key,
  kind         text not null,
  ref_id       text not null,
  fingerprint  text not null,
  text         text not null,
  model        text default 'claude-opus-4-7',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists ai_cache_kind_ref_idx on public.ai_cache(kind, ref_id);
create index if not exists ai_cache_updated_at_idx on public.ai_cache(updated_at);

-- RLS is intentionally NOT enabled. The CRM uses the service-role key
-- server-side which bypasses RLS regardless. If the anon/browser key ever
-- needs read access, add an explicit policy below.
-- alter table public.ai_cache enable row level security;
