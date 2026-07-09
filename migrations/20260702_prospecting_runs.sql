-- Region prospecting runs: a saved scan of a region for subdivision candidates.
-- Optional — the app degrades gracefully if this table is absent (the scan just
-- isn't persisted). Apply in the Supabase SQL editor when ready.

create table if not exists prospecting_runs (
  id              uuid primary key default gen_random_uuid(),
  region          text not null,
  state           text,
  bbox            jsonb,  -- [xmin,ymin,xmax,ymax]
  params          jsonb,  -- { minAreaSqm, maxCandidates }
  candidate_count integer not null default 0,
  candidates      jsonb,  -- [ Candidate ] (lot/plan, area, minLot, estLots, zone, lga, center)
  created_by      text,
  created_at      timestamptz not null default now()
);

create index if not exists prospecting_runs_created_at_idx on prospecting_runs (created_at desc);

alter table prospecting_runs enable row level security;
