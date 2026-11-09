-- Let the e-signature engine and the audit trail accept a Preliminary Assessment.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Run AFTER migrations/20261006_preliminary_assessments.sql. Safe to re-run:
-- each constraint is dropped (if exists) and rebuilt.
--
-- The Preliminary Assessment (doc_type = 'preliminary_assessment') is sent to
-- its applicants through the same signature_requests + /sign/<token> machinery
-- as every other signable document. The engine refuses doc types it does not
-- know, at two CHECK constraints, and they fail differently:
--
--   signature_requests         fails LOUDLY — the insert 500s and nothing sends.
--   compliance_document_audit  fails SILENTLY — recordAudit() is fail-open, so a
--                              rejected insert is logged and swallowed and the
--                              document simply has no history. That is how the
--                              three introducer documents were signed with an
--                              empty trail until 20260821 caught it.
--
-- So both are widened here, together, and BOTH ARE REBUILT FROM THE FULL LIST
-- as at migrations/20260821_referral_consent_esignature.sql (the last migration
-- to touch either). Adding one value to whatever happens to be there is how
-- 'eoi' and the introducer types went missing in the first place.

-- ── The signature engine ─────────────────────────────────────────────────────
-- Guarded on the table existing, so this is safe to run on a project where
-- 20260713_signature_requests.sql has not been applied yet.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'signature_requests'
  ) then
    alter table signature_requests
      drop constraint if exists signature_requests_doc_type_check;
    alter table signature_requests
      add constraint signature_requests_doc_type_check
      check (doc_type in (
        'fact_find',
        'needs_analysis',
        'credit_authorisation',
        'eoi',
        'introducer_nda',
        'introducer_agreement',
        'introducer_schedule',
        'referral_consent',
        'preliminary_assessment'
      ));
  end if;
end $$;

-- ── The audit trail ──────────────────────────────────────────────────────────
-- Same DO-block shape as the earlier wideners. 'aml_case' is in this list and
-- not the one above on purpose: a CDD case is audited and locked but is never
-- sent for signature.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'compliance_document_audit'
  ) then
    alter table compliance_document_audit
      drop constraint if exists compliance_document_audit_doc_type_check;
    alter table compliance_document_audit
      add constraint compliance_document_audit_doc_type_check
      check (doc_type in (
        'fact_find',
        'needs_analysis',
        'credit_authorisation',
        'aml_case',
        'eoi',
        'introducer_nda',
        'introducer_agreement',
        'introducer_schedule',
        'referral_consent',
        'preliminary_assessment'
      ));
  end if;
end $$;
