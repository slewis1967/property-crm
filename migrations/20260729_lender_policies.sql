-- Lender Policy Database — every Australian home-loan lender's published
-- lending policy, versioned, with a source URL and an as-at date behind every
-- fact. Backs /lenders (reference library) and /lenders/match (scenario →
-- ranked shortlist), and supplies the per-lender parameter layer for the
-- servicing engine in utils/finance/capacity.ts.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS guards + explicit column top-ups).
--
-- The app degrades gracefully if these tables are absent: the library falls
-- back to the committed research pack in data/lender-policies/, so /lenders and
-- the matching engine work before this is applied. Applying it is what enables
-- broker EDITS and the human-confirmation workflow.
--
-- NAMING: `lender_policies`, not `lenders`. The generic name risks colliding
-- with an unrelated table already in this Supabase project — the trap that bit
-- `fact_finds` (see migrations/20260709_borrower_fact_finds.sql), where
-- `create table if not exists` silently no-ops against a pre-existing table and
-- leaves the feature broken with a confusing column-level error. The explicit
-- `alter table ... add column if not exists` block below is the second belt:
-- even against a pre-existing table of this name, the columns arrive.
--
-- PII posture: there is NONE here. This is published lender policy, not client
-- data. RLS is still enabled default-deny so the browser anon key can't read or
-- write it — policy records are a business asset and edits must go through the
-- authenticated server routes, which use the service key.

-- ── The policy record ──────────────────────────────────────────────────────
-- One row per lender per version. `id` is a stable slug ('cba', 'pepper-money')
-- and is the join key to data/lender-policies/<id>.json and the /lenders/<id>
-- route — never regenerate it.
--
-- The eight policy sections live in `data` jsonb rather than 200 columns: the
-- taxonomy is defined once in utils/lender-policy/types.ts and will keep
-- growing, and a Postgres migration per new policy field would guarantee the
-- code and the schema drift apart. The columns beside `data` are denormalised
-- purely so the list view and filters can be served without parsing every blob.
create table if not exists public.lender_policies (
  id                text primary key,                       -- stable slug
  name              text not null,
  legal_name        text,
  tier              text not null default 'other',          -- major_bank | regional_bank | mutual_bank | foreign_bank | non_bank | neobank_digital | specialist_near_prime | white_label | other
  status            text not null default 'active',         -- active | paused | withdrawn | research_only
  acl               text,                                   -- Australian Credit Licence number
  abn               text,
  broker_site_url   text,
  policy_doc_url    text,                                   -- the credit policy guide this record was built from
  funder            text,                                   -- for white-label products
  panels            text[],                                 -- aggregator panels, where known

  data              jsonb not null default '{}'::jsonb,     -- the 8 sections (utils/lender-policy/types.ts)

  version           integer not null default 1,
  effective_from    date,                                   -- when this version of the policy takes effect
  effective_to      date,                                   -- null = current
  researched_at     date,
  researched_by     text,                                   -- 'research:<model>' or an operator email
  gaps              text[],                                 -- what the research pass could NOT establish

  -- Verification counters, recomputed on every write by the API route so the
  -- list can sort/filter on data quality without loading every blob.
  fields_total      integer not null default 0,
  fields_verified   integer not null default 0,
  fields_unverified integer not null default 0,

  reviewed_by       text,                                   -- broker who confirmed the record
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Idempotent top-up. `create table if not exists` no-ops against a pre-existing
-- table of the same name, so every column is also added explicitly. This is
-- what makes the file safe both to re-run and to run against a collision.
alter table public.lender_policies add column if not exists legal_name        text;
alter table public.lender_policies add column if not exists tier              text not null default 'other';
alter table public.lender_policies add column if not exists status            text not null default 'active';
alter table public.lender_policies add column if not exists acl               text;
alter table public.lender_policies add column if not exists abn               text;
alter table public.lender_policies add column if not exists broker_site_url   text;
alter table public.lender_policies add column if not exists policy_doc_url    text;
alter table public.lender_policies add column if not exists funder            text;
alter table public.lender_policies add column if not exists panels            text[];
alter table public.lender_policies add column if not exists data              jsonb not null default '{}'::jsonb;
alter table public.lender_policies add column if not exists version           integer not null default 1;
alter table public.lender_policies add column if not exists effective_from    date;
alter table public.lender_policies add column if not exists effective_to      date;
alter table public.lender_policies add column if not exists researched_at     date;
alter table public.lender_policies add column if not exists researched_by     text;
alter table public.lender_policies add column if not exists gaps              text[];
alter table public.lender_policies add column if not exists fields_total      integer not null default 0;
alter table public.lender_policies add column if not exists fields_verified   integer not null default 0;
alter table public.lender_policies add column if not exists fields_unverified integer not null default 0;
alter table public.lender_policies add column if not exists reviewed_by       text;
alter table public.lender_policies add column if not exists reviewed_at       timestamptz;
alter table public.lender_policies add column if not exists created_at        timestamptz not null default now();
alter table public.lender_policies add column if not exists updated_at        timestamptz not null default now();

create index if not exists lender_policies_tier_idx    on public.lender_policies (tier);
create index if not exists lender_policies_status_idx  on public.lender_policies (status);
create index if not exists lender_policies_name_idx    on public.lender_policies (lower(name));
create index if not exists lender_policies_data_gin    on public.lender_policies using gin (data);

alter table public.lender_policies enable row level security;

-- ── Version history ────────────────────────────────────────────────────────
-- A superseded policy record is never overwritten in place. Lender policy is
-- the kind of thing a broker has to be able to reconstruct after the fact
-- ("what did their buffer say when I recommended them in March?"), and an
-- append-only history is the only honest way to answer that. Every accepted
-- research pass or broker edit writes the OLD blob here first.
create table if not exists public.lender_policy_versions (
  id             uuid primary key default gen_random_uuid(),
  lender_id      text not null,                       -- soft FK → lender_policies.id
  version        integer not null,
  data           jsonb not null default '{}'::jsonb,
  effective_from date,
  effective_to   date,
  changed_by     text,
  change_reason  text,                                -- 'research' | 'broker_edit' | 'import' | free text
  created_at     timestamptz not null default now()
);

create index if not exists lender_policy_versions_lender_idx
  on public.lender_policy_versions (lender_id, version desc);

alter table public.lender_policy_versions enable row level security;

-- ── Field-level human confirmation ─────────────────────────────────────────
-- The manual correction layer that sits on top of AI research. A broker who has
-- checked one field against the real policy document (or their BDM) records it
-- here; the API folds these over the researched blob on read, which is what
-- promotes a fact to `human_confirmed` — the one status that outranks the
-- plausibility and confidence heuristics in utils/lender-policy/verify.ts.
--
-- Kept as its own table rather than edited into `data` so a later research pass
-- can refresh the whole blob WITHOUT destroying human corrections. That
-- separation is the point: automated research must never be able to silently
-- overwrite a broker who checked.
create table if not exists public.lender_policy_field_reviews (
  id            uuid primary key default gen_random_uuid(),
  lender_id     text not null,                        -- soft FK → lender_policies.id
  field_path    text not null,                        -- e.g. 'servicing.assessmentBufferPct'
  value         jsonb,                                -- the confirmed value
  as_at         date not null,                        -- date the confirmed value is current
  source_url    text,                                 -- the document the broker checked
  source_title  text,
  note          text,
  confirmed_by  text not null,                        -- CF-Access user email
  confirmed_at  timestamptz not null default now(),
  -- Set when a later review supersedes this one; nulls are the live set.
  superseded_at timestamptz
);

create unique index if not exists lender_policy_field_reviews_live_idx
  on public.lender_policy_field_reviews (lender_id, field_path)
  where superseded_at is null;

create index if not exists lender_policy_field_reviews_lender_idx
  on public.lender_policy_field_reviews (lender_id);

alter table public.lender_policy_field_reviews enable row level security;

-- ── Research run log ───────────────────────────────────────────────────────
-- Proves the research pipeline actually ran, and records what it rejected.
-- Same lesson as paid_service_alerts' heartbeat rows and the YLA sweep: a
-- pipeline that has silently stopped producing is worse than one that never
-- existed, because the stale database still looks authoritative.
create table if not exists public.lender_policy_research_runs (
  id                uuid primary key default gen_random_uuid(),
  lender_id         text,                             -- null = a bulk tranche run
  status            text not null default 'ok',       -- ok | partial | failed
  model             text,
  fields_proposed   integer not null default 0,
  fields_accepted   integer not null default 0,
  fields_rejected   integer not null default 0,
  -- Why fields were rejected, keyed by field path → issue codes. This is the
  -- audit trail for the anti-hallucination gate; if it is empty run after run,
  -- the gate is not doing anything and should be suspected, not trusted.
  rejections        jsonb not null default '{}'::jsonb,
  notes             text,
  triggered_by      text,
  created_at        timestamptz not null default now()
);

create index if not exists lender_policy_research_runs_created_idx
  on public.lender_policy_research_runs (created_at desc);
create index if not exists lender_policy_research_runs_lender_idx
  on public.lender_policy_research_runs (lender_id, created_at desc);

alter table public.lender_policy_research_runs enable row level security;
