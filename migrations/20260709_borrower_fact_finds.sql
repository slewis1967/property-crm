-- borrower_fact_finds — Borrower Fact Find submissions.
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS guards).
--
-- Backs /fact-find (list) and /fact-find/[id] (the form). The whole seven-page
-- form lives in `data` jsonb — its shape is defined once in utils/factfind.ts
-- (FactFindData). The columns beside it are denormalised copies written on every
-- save purely so the list view can render without parsing each blob.
--
-- NAMING: deliberately NOT `fact_finds`. A `fact_finds` table already exists in
-- this Supabase project, owned by a different feature (lead_id → smart_leads.id,
-- financial_data, verified_capacity, ai_verification_status). It is unrelated to
-- this form and must not be reused — `create table if not exists fact_finds`
-- would silently no-op against it and leave this feature broken.
--
-- Optional: the app degrades gracefully if this table is absent (the list shows
-- empty; saving returns a "run the migration" message).

create table if not exists borrower_fact_finds (
  id             uuid primary key default gen_random_uuid(),
  applicant_name text,                                 -- "Smith, John & Smith, Jane" (for the list)
  status         text not null default 'Draft',        -- Draft | In review | Complete
  contact_id     text,                                 -- optional link to contacts.id (text — soft FK)
  deal_id        uuid,                                 -- optional link to dev_opportunities.id
  loan_amount    numeric,                              -- data->loan->amount_required (for the list)
  referred_by    text,
  data           jsonb not null default '{}'::jsonb,   -- the full fact find (utils/factfind.ts FactFindData)
  created_by     text,                                 -- CF-Access user email
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists borrower_fact_finds_created_idx on borrower_fact_finds (created_at desc);
create index if not exists borrower_fact_finds_status_idx  on borrower_fact_finds (status);
create index if not exists borrower_fact_finds_contact_idx on borrower_fact_finds (contact_id);

-- Keep updated_at fresh on every change.
create or replace function set_borrower_fact_finds_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists borrower_fact_finds_set_updated_at on borrower_fact_finds;
create trigger borrower_fact_finds_set_updated_at
  before update on borrower_fact_finds
  for each row execute function set_borrower_fact_finds_updated_at();

-- Match the schema's posture: RLS on, default-deny. This table holds borrower
-- PII (DOB, licence number, income, liabilities), so the browser anon key must
-- never read it. Server routes use the service key (utils/supabase.ts), which
-- bypasses RLS. Do not add a permissive policy here.
alter table borrower_fact_finds enable row level security;
