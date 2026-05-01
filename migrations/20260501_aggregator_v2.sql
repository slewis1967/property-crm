-- Aggregator v2: extend global_stock_pool + new tables for ingestion pipeline.
--
-- Apply order:
--   1. extensions to global_stock_pool (ALTER TABLE)
--   2. backfill legacy rows so they don't get withdrawn on first new run
--   3. create builders, ingestion_run, property_review_queue, property_media
--
-- This file is idempotent — safe to re-run.

-- ── 1. Extend global_stock_pool ──────────────────────────────────────────────
alter table public.global_stock_pool
  add column if not exists ingestion_run_id  uuid,
  add column if not exists pipeline_status   text default 'active',
  add column if not exists confidence_score  numeric(3,2),
  add column if not exists last_seen_at      timestamptz,
  add column if not exists withdrawn_at      timestamptz,
  add column if not exists source_email_id   text,
  add column if not exists source_artifact_url text,
  add column if not exists source            text,
  add column if not exists builder_id        uuid;

-- pipeline_status enum-ish:
--   'active'           — visible in CRM, currently for sale
--   'pending_review'   — extracted with mid confidence, visible with yellow badge
--   'withdrawn'        — was on a stocklist but disappeared (30 day grace)
--   'sold'             — explicit sold marker (set manually or by future logic)
--   'legacy'           — pre-pipeline import, superseded as new data flows in
--   'archived'         — withdrawn > 30 days, hidden from CRM grid

create index if not exists global_stock_pool_pipeline_status_idx
  on public.global_stock_pool(pipeline_status);
create index if not exists global_stock_pool_builder_estate_lot_idx
  on public.global_stock_pool(builder_name, estate_name, lot_number);
create index if not exists global_stock_pool_last_seen_idx
  on public.global_stock_pool(last_seen_at desc);

-- ── 2. Backfill legacy rows ──────────────────────────────────────────────────
-- The 149 rows from 2026-04-22 import need pipeline_status='legacy' so the
-- merge logic doesn't withdraw them on the first new builder ingestion (which
-- would only have data for one builder).
update public.global_stock_pool
   set pipeline_status = 'legacy',
       source = coalesce(source, 'legacy_2026_04_22_import'),
       last_seen_at = coalesce(last_seen_at, created_at)
 where pipeline_status is null
    or pipeline_status = 'active';

-- ── 3. New tables ────────────────────────────────────────────────────────────

create table if not exists public.builders (
  id              uuid primary key default gen_random_uuid(),
  canonical_name  text unique not null,
  aliases         text[] default array[]::text[],
  sender_domains  text[] default array[]::text[],
  contact_email   text,
  contact_phone   text,
  active          boolean default true,
  draft           boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists builders_active_idx on public.builders(active);
create index if not exists builders_sender_domains_idx on public.builders using gin(sender_domains);

-- Each end-to-end pipeline execution is one ingestion_run row.
-- Use as audit anchor + idempotency key (one run per email_id).
create table if not exists public.ingestion_run (
  id                uuid primary key default gen_random_uuid(),
  email_id          text,
  email_subject     text,
  email_received_at timestamptz,
  builder_id        uuid references public.builders(id) on delete set null,
  builder_name      text,
  started_at        timestamptz default now(),
  ended_at          timestamptz,
  artifacts_seen    int default 0,
  props_extracted   int default 0,
  props_added       int default 0,
  props_updated     int default 0,
  props_withdrawn   int default 0,
  props_to_review   int default 0,
  status            text default 'running',
  error             text,
  ai_input_tokens   int,
  ai_output_tokens  int,
  ai_cost_usd       numeric(10,4)
);

create index if not exists ingestion_run_email_id_idx on public.ingestion_run(email_id);
create index if not exists ingestion_run_started_at_idx on public.ingestion_run(started_at desc);
create index if not exists ingestion_run_builder_id_idx on public.ingestion_run(builder_id);
create index if not exists ingestion_run_status_idx on public.ingestion_run(status);

-- Low-confidence extractions land here for human review before publishing.
-- Mid-confidence extractions go straight into global_stock_pool with
-- pipeline_status='pending_review' (visible with yellow badge).
create table if not exists public.property_review_queue (
  id                  uuid primary key default gen_random_uuid(),
  ingestion_run_id    uuid references public.ingestion_run(id) on delete set null,
  raw_extraction      jsonb,
  proposed_action     text,
  proposed_property_id uuid,
  builder_name        text,
  estate_name         text,
  lot_number          text,
  confidence_score    numeric(3,2),
  reasons             text[] default array[]::text[],
  status              text default 'pending',
  reviewed_by         text,
  reviewed_at         timestamptz,
  created_at          timestamptz default now()
);

create index if not exists prq_status_idx on public.property_review_queue(status);
create index if not exists prq_created_at_idx on public.property_review_queue(created_at desc);

-- Floor plans, facades, brochures linked to properties.
-- One property can have many media items.
create table if not exists public.property_media (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid references public.global_stock_pool(id) on delete cascade,
  kind          text not null,
  storage_path  text not null,
  source_url    text,
  ocr_text      text,
  width_px      int,
  height_px     int,
  size_bytes    bigint,
  created_at    timestamptz default now()
);

create index if not exists property_media_property_id_idx on public.property_media(property_id);
create index if not exists property_media_kind_idx on public.property_media(kind);

-- ── RLS notes ────────────────────────────────────────────────────────────────
-- Service-role key bypasses RLS, so server code is unaffected.
-- If browser-side reads are ever needed, add policies per table here.
