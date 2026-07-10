-- credit_authorisations — Credit File Authorisation submissions.
-- The Equifax "Access Seeker Report – Client Privacy Consent Form".
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS guards).
--
-- Backs /credit-authorisation (list) and /credit-authorisation/[id] (the form).
-- The form is almost entirely fixed legal text (utils/creditAuthorisation.ts
-- CREDIT_AUTHORISATION_TEXT); only the applicant name(s), address and the two
-- signature/date blocks are captured, and they live in `data` jsonb
-- (CreditAuthorisationData). The `names` column beside it is a denormalised copy
-- written on every save purely so the list view can render without parsing each
-- blob.
--
-- NAMING: `credit_authorisations` was verified free of collisions in this
-- project before creating it.
--
-- Optional: the app degrades gracefully if this table is absent (the list shows
-- empty; saving returns a "run the migration" message).

create table if not exists credit_authorisations (
  id          uuid primary key default gen_random_uuid(),
  names       text,                                   -- "John Smith & Jane Smith" (for the list)
  status      text not null default 'draft',          -- draft | signed
  contact_id  text,                                   -- optional link to contacts.id (text — soft FK)
  deal_id     uuid,                                   -- optional link to dev_opportunities.id
  data        jsonb not null default '{}'::jsonb,     -- the full form (utils/creditAuthorisation.ts CreditAuthorisationData)
  created_by  text,                                   -- CF-Access user email
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists credit_authorisations_created_idx on credit_authorisations (created_at desc);
create index if not exists credit_authorisations_status_idx  on credit_authorisations (status);
create index if not exists credit_authorisations_contact_idx on credit_authorisations (contact_id);

-- Keep updated_at fresh on every change.
create or replace function set_credit_authorisations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists credit_authorisations_set_updated_at on credit_authorisations;
create trigger credit_authorisations_set_updated_at
  before update on credit_authorisations
  for each row execute function set_credit_authorisations_updated_at();

-- Match the schema's posture: RLS on, default-deny. This table holds borrower
-- PII (name and residential address on a signed privacy-consent form), so the
-- browser anon key must never read it. Server routes use the service key
-- (utils/supabase.ts), which bypasses RLS. Do not add a permissive policy here.
alter table credit_authorisations enable row level security;
