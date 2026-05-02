-- PIA reports — saved Property Investment Analysis runs.
--
-- One row per "save" from the /pia page. Lets us list scenarios on the
-- opportunity detail page, replay an old report, and track what got
-- emailed to a buyer (and when).
--
-- Inputs + results are stored as jsonb so the PIA model can evolve without
-- migrations. The shape is governed by /app/pia/_calc.ts (PiaInputs / runPia).

create table if not exists public.pia_reports (
  id              uuid primary key default gen_random_uuid(),
  -- opportunity_id is intentionally not FK'd. The /opportunities/[id] detail
  -- page is keyed by a NEXUS lead UUID (lives in Flask, not Supabase), but
  -- callers may also pass a GHL archive opportunity id (text). We accept
  -- either and let the context API handle the lookup fork.
  opportunity_id  text,
  contact_id      uuid,                                       -- contacts.id (live) OR ghl_archive_contacts.id (archive)
  property_id     uuid references public.global_stock_pool(id) on delete set null,
  title           text not null,                              -- e.g. "PIA — 12 Sample St, Brisbane"
  inputs          jsonb not null,                             -- PiaInputs snapshot
  results         jsonb,                                      -- runPia(inputs) snapshot for static replay (regenerated on view)
  generated_by    text,                                       -- cf-access user email
  generated_at    timestamptz default now(),
  -- Email audit
  last_emailed_to text,
  last_emailed_at timestamptz,
  email_count     int default 0
);

create index if not exists pia_reports_opportunity_idx on public.pia_reports(opportunity_id);
create index if not exists pia_reports_contact_idx     on public.pia_reports(contact_id);
create index if not exists pia_reports_property_idx    on public.pia_reports(property_id);
create index if not exists pia_reports_generated_at_idx on public.pia_reports(generated_at desc);
