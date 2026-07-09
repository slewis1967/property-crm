-- Development Watchlist — site opportunities captured from Region Prospecting
-- and the Planning Feasibility tool, tracked through a deal pipeline.
--
-- Optional: the app degrades gracefully if this table is absent (Save returns a
-- "run the migration" message; the list shows empty). Apply in the Supabase SQL
-- editor when ready.

create table if not exists dev_opportunities (
  id                    uuid primary key default gen_random_uuid(),
  source                text not null default 'prospecting', -- prospecting | feasibility
  address               text,
  lot_plan              text,
  lga                   text,
  state                 text,
  zone_code             text,
  area_sqm              numeric,
  min_lot_sqm           numeric,
  est_lots              integer,
  extra_lots            integer,
  center                jsonb,   -- { lng, lat }
  stage                 text not null default 'Identified',
  notes                 text,
  feasibility_report_id uuid,    -- optional link to feasibility_reports.id
  data                  jsonb,   -- full candidate / summary snapshot
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists dev_opportunities_created_at_idx on dev_opportunities (created_at desc);
create index if not exists dev_opportunities_stage_idx on dev_opportunities (stage);

alter table dev_opportunities enable row level security;
