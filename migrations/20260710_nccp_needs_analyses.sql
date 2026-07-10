-- nccp_needs_analyses — NCCP Client Needs Analysis submissions.
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS guards).
--
-- Backs /needs-analysis (list) and /needs-analysis/[id] (the form). The whole
-- six-page form lives in `data` jsonb — its shape is defined once in
-- utils/needsAnalysis.ts (NeedsAnalysisData). The columns beside it are
-- denormalised copies written on every save purely so the list view can render
-- without parsing each blob.
--
-- NAMING: deliberately `nccp_needs_analyses`, prefixed to avoid colliding with
-- any generic `needs_analysis`/`fact_finds` table. This is a separate document
-- from borrower_fact_finds (the Borrower Fact Find) even though the two forms
-- overlap heavily — the needs analysis is a distinct NCCP compliance artefact.
--
-- Optional: the app degrades gracefully if this table is absent (the list shows
-- empty; saving returns a "run the migration" message).

create table if not exists nccp_needs_analyses (
  id             uuid primary key default gen_random_uuid(),
  applicant_name text,                                 -- "Smith, John & Smith, Jane" (for the list)
  status         text not null default 'Draft',        -- Draft | In review | Complete
  contact_id     text,                                 -- optional link to contacts.id (text — soft FK)
  deal_id        uuid,                                 -- optional link to dev_opportunities.id
  loan_amount    numeric,                              -- data->loan_amount_sought (for the list)
  data           jsonb not null default '{}'::jsonb,   -- the full needs analysis (utils/needsAnalysis.ts)
  created_by     text,                                 -- CF-Access user email
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists nccp_needs_analyses_created_idx on nccp_needs_analyses (created_at desc);
create index if not exists nccp_needs_analyses_status_idx  on nccp_needs_analyses (status);
create index if not exists nccp_needs_analyses_contact_idx on nccp_needs_analyses (contact_id);

-- Keep updated_at fresh on every change.
create or replace function set_nccp_needs_analyses_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nccp_needs_analyses_set_updated_at on nccp_needs_analyses;
create trigger nccp_needs_analyses_set_updated_at
  before update on nccp_needs_analyses
  for each row execute function set_nccp_needs_analyses_updated_at();

-- Match the schema's posture: RLS on, default-deny. This table holds borrower
-- PII (DOB, licence/passport number, TFN status, income, liabilities), so the
-- browser anon key must never read it. Server routes use the service key
-- (utils/supabase.ts), which bypasses RLS. Do not add a permissive policy here.
alter table nccp_needs_analyses enable row level security;
