-- Employee due diligence on the AML/CTF staff register.
--
-- WHY: the original build (migrations/20260715_aml.sql) records staff TRAINING
-- only. Employee due diligence is a separate obligation — screening and vetting
-- the people who operate the program, not teaching them about it. A register
-- that proves everyone was trained says nothing about whether anyone was
-- checked.
--
-- Modelled as extra columns on aml_training rather than a new table: it is the
-- same subject (a staff member) and the same evidence trail, and two registers
-- that must be kept in step is how one of them goes stale.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run. Additive and nullable — existing training rows stay valid,
-- and no due-diligence outcome is invented for staff nobody has actually checked.

alter table public.aml_training add column if not exists edd_completed_on date;
alter table public.aml_training add column if not exists edd_outcome      text;
alter table public.aml_training add column if not exists edd_notes        text;

create index if not exists aml_training_edd_idx
  on public.aml_training (edd_completed_on desc)
  where edd_completed_on is not null;

comment on column public.aml_training.edd_completed_on is
  'Employee due diligence: date the staff screening/vetting was completed.';
comment on column public.aml_training.edd_outcome is
  'Employee due diligence: cleared | concerns | not_started.';
