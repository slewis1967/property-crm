-- ============================================================================
-- Archistar-replica program — combined migrations (run once in Supabase).
-- Supabase Dashboard → SQL Editor → New query → paste all → Run.
-- Idempotent + safe to re-run (IF NOT EXISTS guards). Order does not matter;
-- there are no cross-table foreign keys.
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ── 1. feasibility_reports — saved Planning Feasibility assessments ──────────
create table if not exists feasibility_reports (
  id           uuid primary key default gen_random_uuid(),
  address      text,
  property_id  text,
  title        text,
  subtitle     text,
  report       jsonb not null default '{}'::jsonb,
  transcript   jsonb default '[]'::jsonb,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists feasibility_reports_created_idx  on feasibility_reports (created_at desc);
create index if not exists feasibility_reports_property_idx on feasibility_reports (property_id);

create or replace function set_feasibility_reports_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists feasibility_reports_set_updated_at on feasibility_reports;
create trigger feasibility_reports_set_updated_at
  before update on feasibility_reports
  for each row execute function set_feasibility_reports_updated_at();

alter table feasibility_reports enable row level security;

-- ── 2. parcel_lookups — cache of authoritative site lookups ──────────────────
create table if not exists parcel_lookups (
  id           uuid primary key default gen_random_uuid(),
  address_key  text not null,
  address      text not null,
  state        text,
  lng          double precision,
  lat          double precision,
  parcel       jsonb,
  controls     jsonb,
  overlays     jsonb,
  sources      jsonb,
  coverage     text,
  notes        jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists parcel_lookups_address_key_idx on parcel_lookups (address_key);
create index if not exists parcel_lookups_created_at_idx  on parcel_lookups (created_at desc);
alter table parcel_lookups enable row level security;

-- ── 3. prospecting_runs — saved region scans ─────────────────────────────────
create table if not exists prospecting_runs (
  id              uuid primary key default gen_random_uuid(),
  region          text not null,
  state           text,
  bbox            jsonb,
  params          jsonb,
  candidate_count integer not null default 0,
  candidates      jsonb,
  created_by      text,
  created_at      timestamptz not null default now()
);
create index if not exists prospecting_runs_created_at_idx on prospecting_runs (created_at desc);
alter table prospecting_runs enable row level security;

-- ── 4. dev_opportunities — Development Watchlist ─────────────────────────────
create table if not exists dev_opportunities (
  id                    uuid primary key default gen_random_uuid(),
  source                text not null default 'prospecting',
  address               text,
  lot_plan              text,
  lga                   text,
  state                 text,
  zone_code             text,
  area_sqm              numeric,
  min_lot_sqm           numeric,
  est_lots              integer,
  extra_lots            integer,
  center                jsonb,
  stage                 text not null default 'Identified',
  notes                 text,
  feasibility_report_id uuid,
  data                  jsonb,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists dev_opportunities_created_at_idx on dev_opportunities (created_at desc);
create index if not exists dev_opportunities_stage_idx      on dev_opportunities (stage);
alter table dev_opportunities enable row level security;
