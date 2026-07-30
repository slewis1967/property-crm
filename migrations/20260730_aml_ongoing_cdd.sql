-- Ongoing customer due diligence for AML/CTF cases.
--
-- WHY: CDD in the original build (migrations/20260715_aml.sql) is a one-off gate
-- at onboarding. AUSTRAC expects customer information to be kept current and
-- parties to be re-screened on an ONGOING basis — sanctions and PEP lists change
-- after you onboard someone, so a case that was clear in July can be a confirmed
-- match in October without anything in the CRM changing. Before this migration
-- the word "ongoing" appeared only as prose in the UI; there was no mechanism.
--
-- The cadence is risk-based (utils/aml.ts REVIEW_CADENCE_MONTHS: high 6 months,
-- medium 12, low 24), which is the point of a risk-based program — the higher the
-- assessed risk, the sooner you look again.
--
-- Both columns are nullable and there is no backfill: an existing case with no
-- next_review_at simply isn't due yet, and gets a date the next time it is saved.
-- That is deliberate — inventing review dates for historical cases would
-- manufacture a compliance record nobody actually performed.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run.

alter table public.aml_cases add column if not exists next_review_at  date;
alter table public.aml_cases add column if not exists last_reviewed_at date;

-- The review queue is "everything due on or before today, oldest first", so the
-- index is on the due date alone.
create index if not exists aml_cases_next_review_idx
  on public.aml_cases (next_review_at)
  where next_review_at is not null;

comment on column public.aml_cases.next_review_at is
  'Ongoing CDD: date this case is next due for review. Derived from risk rating via utils/aml.ts nextReviewDate().';
comment on column public.aml_cases.last_reviewed_at is
  'Ongoing CDD: date an operator last completed a periodic review of this case.';
