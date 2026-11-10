-- compliance_document_audit — append-only audit trail + sign-lock support for
-- the three NCCP/Equifax compliance documents (Borrower Fact Find, NCCP Needs
-- Analysis, Credit File Authorisation).
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS / add-column guards).
--
-- WHY: the three documents get signed. Their PATCH routes used to overwrite the
-- whole `data` blob (including `status`) with no record of who changed what/when
-- and no lock once signed — a signed compliance artefact could be silently
-- altered. This migration adds:
--   1. an APPEND-ONLY audit log of every create/update/sign/reopen/delete, and
--   2. an `updated_by` column on each doc table (the last editor's CF-Access
--      email). "Locked" is DERIVED FROM `status` (terminal value per doc:
--      fact_find/needs_analysis = 'Complete', credit_authorisation = 'signed'),
--      so there is one source of truth — no separate `locked` column to drift.
--
-- APPEND-ONLY: rows in compliance_document_audit are only ever INSERTed. Do not
-- UPDATE or DELETE audit rows — the whole point is a tamper-evident history.
--
-- Optional: the app degrades gracefully if this table is absent (audit writes
-- are skipped with a logged warning; the docs still save). Apply this migration
-- to activate the audit trail + sign-lock.

create table if not exists compliance_document_audit (
  id            uuid primary key default gen_random_uuid(),
  doc_type      text not null check (doc_type in ('fact_find','needs_analysis','credit_authorisation','aml_case')),
  doc_id        uuid not null,                        -- the audited document's id
  action        text not null check (action in ('create','update','sign','reopen','delete')),
  changed_by    text,                                 -- CF-Access user email of the actor
  changed_at    timestamptz not null default now(),
  status_after  text,                                 -- the document's status after this change
  data_snapshot jsonb,                                -- the full `data` blob at the time (holds PII)
  note          text                                  -- optional human note (e.g. reopen reason)
);

-- The one query the history endpoint runs: all rows for one document, newest first.
create index if not exists compliance_document_audit_doc_idx
  on compliance_document_audit (doc_type, doc_id, changed_at desc);

-- Match the schema's posture: RLS on, default-deny. Snapshots hold the same
-- borrower PII as the documents themselves, so the browser anon key must never
-- read them. Server routes use the service key (utils/supabase.ts), which
-- bypasses RLS. Do not add a permissive policy here — and never add UPDATE/DELETE
-- access: this table is append-only.
alter table compliance_document_audit enable row level security;

-- Track the last editor on each document (mirrors the existing created_by).
alter table borrower_fact_finds   add column if not exists updated_by text;
alter table nccp_needs_analyses   add column if not exists updated_by text;
alter table credit_authorisations add column if not exists updated_by text;
