-- Opportunity calculations — saved War Room calculator scenarios.
--
-- One row per saved scenario from any of the six War Room calculators
-- (yield, stamp_duty, borrowing, growth, fhg, repayment). Lets advisors
-- run multiple "what if" cases per opportunity and revisit them later.
--
-- Inputs + outputs are jsonb — each calculator owns its own input shape,
-- and outputs are stored alongside inputs so the list view can show a
-- key headline number without re-running the calc.

create table if not exists public.opportunity_calculations (
  id               uuid primary key default gen_random_uuid(),
  -- Same convention as pia_reports: opportunity_id is the NEXUS lead UUID
  -- (lives in DuckDB, not Supabase) so we don't FK it.
  opportunity_id   text not null,
  calculator_type  text not null check (calculator_type in (
    'yield', 'stamp_duty', 'borrowing', 'growth', 'fhg', 'repayment'
  )),
  name             text not null,                                -- user-given scenario label
  inputs           jsonb not null,                               -- form state snapshot
  outputs          jsonb,                                        -- computed results (denormalised for list view)
  created_by       text,                                         -- cf-access user email
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists opp_calc_opportunity_idx on public.opportunity_calculations(opportunity_id);
create index if not exists opp_calc_created_at_idx  on public.opportunity_calculations(created_at desc);
