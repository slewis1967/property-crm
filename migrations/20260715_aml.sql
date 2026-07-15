-- AML/CTF compliance module — AUSTRAC Tranche-2 real-estate obligations
-- (in force 1 July 2026). Backs /aml (CDD cases), /aml/program (enrolment +
-- program + enterprise risk assessment), /aml/reports (SMR/TTR/IFTI), and the
-- screening + training registers.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS guards).
--
-- The app degrades gracefully if these tables are absent (lists show empty;
-- saving returns a "run the migration" message) — mirrors borrower_fact_finds.
--
-- PII posture: every table below holds CDD PII (names, DOB, ID document numbers,
-- source of funds, screening hits). RLS is ON, default-deny — the browser anon
-- key must never read these. Server routes use the service key
-- (utils/supabase.ts), which bypasses RLS. Do NOT add a permissive policy.
--
-- The per-case AUDIT TRAIL reuses the existing `compliance_document_audit`
-- table (migrations/20260712_compliance_audit.sql, doc_type = 'aml_case') via
-- utils/compliance-audit.ts — 7-year record keeping + append-only history come
-- for free. Make sure that migration has also been applied.

-- ── CDD cases ──────────────────────────────────────────────────────────────
-- One Customer Due Diligence case per party (buyer/seller) per transaction.
-- The full CDD blob (identity, beneficial owners, source of funds, verification,
-- screening summary, risk) lives in `data` jsonb — shape defined once in
-- utils/aml.ts (AmlCaseData). Columns beside it are denormalised for the list.
create table if not exists aml_cases (
  id            uuid primary key default gen_random_uuid(),
  party_name    text,                                  -- partySummary(data) — for the list
  party_type    text not null default 'individual',    -- individual | company | trust | smsf
  party_role    text not null default 'buyer',         -- buyer | seller | other
  status        text not null default 'Draft',         -- Draft|In Progress|Screening|Enhanced DD|Cleared|Blocked
  risk_rating   text not null default 'low',           -- low | medium | high
  screening_status text not null default 'pending',    -- pending|clear|potential_match|confirmed_match
  contact_id    text,                                  -- soft FK → contacts.id
  deal_id       uuid,                                  -- soft FK → dev_opportunities.id
  lead_id       text,                                  -- soft FK → property_leads.id
  data          jsonb not null default '{}'::jsonb,    -- the full CDD (utils/aml.ts AmlCaseData)
  created_by    text,                                  -- CF-Access user email
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists aml_cases_created_idx  on aml_cases (created_at desc);
create index if not exists aml_cases_status_idx   on aml_cases (status);
create index if not exists aml_cases_deal_idx     on aml_cases (deal_id);
create index if not exists aml_cases_contact_idx  on aml_cases (contact_id);
create index if not exists aml_cases_risk_idx     on aml_cases (risk_rating);

-- ── Screenings ─────────────────────────────────────────────────────────────
-- One row per screening RUN against one subject (the party or a beneficial
-- owner). Screening is ongoing, so a case accrues many rows over time; the
-- latest per subject is the current state. Matches are stored for the audit
-- trail (a confirmed sanctions hit ⇒ cease to act + consider an SMR).
create table if not exists aml_screenings (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null,                         -- → aml_cases.id
  subject_name  text not null,
  subject_kind  text not null default 'party',         -- party | beneficial_owner
  provider      text not null default 'manual',        -- first_aml | manual
  reference     text,                                  -- provider screening id
  result        text not null default 'pending',       -- pending|clear|potential_match|confirmed_match
  lists         jsonb not null default '[]'::jsonb,     -- ScreeningListCode[]
  matches       jsonb not null default '[]'::jsonb,     -- ScreeningMatch[]
  screened_by   text,
  screened_at   timestamptz not null default now()
);
create index if not exists aml_screenings_case_idx on aml_screenings (case_id, screened_at desc);
create index if not exists aml_screenings_result_idx on aml_screenings (result);

-- ── Reports (AUSTRAC Online: SMR / TTR / IFTI) ─────────────────────────────
-- report_type: SMR (suspicious matter, 3 business days / 24h terrorism),
-- TTR (threshold cash ≥ $10k, 10 business days), IFTI (cross-border, 10 bd).
-- `confidential` marks SMRs — the tipping-off offence means the client must
-- never be told an SMR exists; the UI hides these from client-facing surfaces.
create table if not exists aml_reports (
  id            uuid primary key default gen_random_uuid(),
  report_type   text not null,                         -- SMR | TTR | IFTI
  status        text not null default 'draft',         -- draft | ready | lodged
  case_id       uuid,                                  -- optional → aml_cases.id
  deal_id       uuid,                                  -- optional → dev_opportunities.id
  subject_name  text,
  trigger_date  date,                                  -- when suspicion formed / cash received / transfer made
  due_date      date,                                  -- statutory deadline (computed, utils/aml.ts)
  terrorism_related boolean not null default false,     -- drives the 24h SMR deadline
  confidential  boolean not null default false,        -- true for SMR (tipping-off)
  austrac_reference text,                              -- AUSTRAC lodgement receipt
  lodged_at     timestamptz,
  data          jsonb not null default '{}'::jsonb,    -- report detail (narrative, amounts, parties)
  created_by    text,
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists aml_reports_type_idx   on aml_reports (report_type);
create index if not exists aml_reports_status_idx on aml_reports (status);
create index if not exists aml_reports_due_idx    on aml_reports (due_date);

-- ── AML/CTF program (single organisation-wide record) ──────────────────────
-- Governance: AUSTRAC enrolment, appointed compliance officer, program approval,
-- and the enterprise risk assessment (customer/transaction/channel/geographic).
-- Held as one row keyed by `org` (default 'nextkey'); the app reads/writes the
-- singleton. Blob shape = utils/aml.ts AmlProgramData.
create table if not exists aml_program (
  org           text primary key default 'nextkey',
  data          jsonb not null default '{}'::jsonb,
  updated_by    text,
  updated_at    timestamptz not null default now()
);

-- ── Staff training register ────────────────────────────────────────────────
-- AML/CTF staff training records (part of the program's obligations).
create table if not exists aml_training (
  id            uuid primary key default gen_random_uuid(),
  staff_name    text not null,
  staff_email   text,
  module        text not null default 'AML/CTF awareness',
  completed_on  date,
  notes         text,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists aml_training_completed_idx on aml_training (completed_on desc);

-- ── updated_at triggers ────────────────────────────────────────────────────
create or replace function set_aml_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists aml_cases_set_updated_at on aml_cases;
create trigger aml_cases_set_updated_at
  before update on aml_cases
  for each row execute function set_aml_updated_at();

drop trigger if exists aml_reports_set_updated_at on aml_reports;
create trigger aml_reports_set_updated_at
  before update on aml_reports
  for each row execute function set_aml_updated_at();

drop trigger if exists aml_program_set_updated_at on aml_program;
create trigger aml_program_set_updated_at
  before update on aml_program
  for each row execute function set_aml_updated_at();

-- ── RLS: on, default-deny (server bypasses via the service key) ────────────
alter table aml_cases      enable row level security;
alter table aml_screenings enable row level security;
alter table aml_reports    enable row level security;
alter table aml_program    enable row level security;
alter table aml_training   enable row level security;
