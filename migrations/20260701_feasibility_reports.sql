-- feasibility_reports — saved Planning Feasibility assessments.
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS guards).
--
-- Backs the /feasibility "Save" button and the saved-reports list. The report
-- JSON is the structured document rendered client-side (utils shape lives in
-- app/feasibility/FeasibilityClient.tsx). `transcript` keeps the interview/auto
-- messages so a saved report can be reopened and, later, refined.

create table if not exists feasibility_reports (
  id           uuid primary key default gen_random_uuid(),
  address      text,
  property_id  text,                                   -- global_stock_pool id if launched from a property
  title        text,                                   -- report.title (for the list)
  subtitle     text,                                   -- report.subtitle (for the list)
  report       jsonb not null default '{}'::jsonb,     -- the structured feasibility report
  transcript   jsonb default '[]'::jsonb,              -- interview/auto messages that produced it
  created_by   text,                                   -- CF-Access user email
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists feasibility_reports_created_idx  on feasibility_reports (created_at desc);
create index if not exists feasibility_reports_property_idx on feasibility_reports (property_id);

-- Keep updated_at fresh on every change.
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

-- Match the schema's posture: RLS on, default-deny. The browser anon key reads
-- nothing; server routes use the service key (utils/supabase.ts) which bypasses
-- RLS. Add policies only if a browser client ever needs direct access.
alter table feasibility_reports enable row level security;
