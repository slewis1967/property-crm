-- The client's Referral Consent and Privacy Form, electronically signed.
--
-- WHAT IT REPLACES. Until now the introducer got the form signed on paper and
-- uploaded a scan, and the submit path looked for an `introducer_documents` row
-- labelled "Signed consent form". That upload is the ONLY evidence behind the
-- attestation the 20260811 header calls "the lawful basis for us holding the
-- record at all" — and it is a photographed page of unknown provenance. It
-- cannot say who signed it, when, or from where.
--
-- An e-signature can. The engine already captures the mark, the signer's email,
-- a timestamp and the IP/user-agent evidence, and it already refuses a document
-- that is not signed by everyone asked. This puts the consent form through it.
--
-- ONE DOCUMENT PER CLIENT, SIGNED BY EVERY APPLICANT ON IT. Consent covers each
-- person's OWN personal information, so a second applicant consents for
-- themselves — one signature on a two-applicant referral is one person's
-- consent, not the household's.
--
-- THE UPLOAD STAYS, AS A FALLBACK. Sean's call, 20 August 2026. A client with no
-- email address must still be referrable, and an introducer holding a form
-- already signed on paper must not have to go back and redo it. Submit accepts
-- either; the portal leads with the signature.
--
-- THE ORDER OF EVENTS MATTERS AND IS WHY THE IN-PERSON ROUTE EXISTS. Emailing a
-- client the form means holding their name and address before their consent
-- exists. The introducer is usually sitting with them, so the portal's default
-- is to open the signing page on the introducer's own device, then and there —
-- no contact before consent. Emailing it is the phone-referral fallback.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS introducer_consent_docs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES introducer_clients(id) ON DELETE CASCADE,

  -- "Draft" until every signer completes, then "Signed". Same vocabulary as
  -- introducer_agreement_docs and the EOI, so the engine needs no special case.
  status          text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Sent','Signed')),

  -- utils/introducer-consent.ts ConsentDocData: the client's details as they
  -- stood when the form was issued, plus the consent wording VERBATIM.
  --
  -- The wording is snapshotted deliberately. CONSENT_STATEMENT names the whole
  -- disclosure chain — G.B. Mayes, Your Loan Assist under ACL 477483, a licensed
  -- adviser, lenders — and if that chain ever changes, a client who signed the
  -- old wording consented to the old chain. A document that re-renders from
  -- today's constant would silently restate what they agreed to.
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- How the signature was collected, for the audit trail. 'in_person' means the
  -- introducer opened the signing page on their own device with the client
  -- present; 'email' means the client was sent a link.
  delivery        text CHECK (delivery IN ('in_person','email')),

  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One live consent document per referral. A superseded draft is deleted and
-- reissued rather than versioned — an unsigned draft has no evidentiary value
-- worth keeping, and a SIGNED one is protected by the guard below.
CREATE UNIQUE INDEX IF NOT EXISTS introducer_consent_docs_client_idx
  ON introducer_consent_docs (client_id);

-- A signed consent form is immutable. This is the document that answers "what
-- did this person actually agree to" if it is ever challenged, so nothing may
-- edit it afterwards — not a route handler, not a later migration, not a
-- well-meaning correction. Reissuing means a new document.
CREATE OR REPLACE FUNCTION introducer_consent_docs_signed_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'Signed' AND NEW.data IS DISTINCT FROM OLD.data THEN
    RAISE EXCEPTION 'introducer_consent_docs: a signed consent form cannot be edited';
  END IF;
  IF OLD.status = 'Signed' AND NEW.status <> 'Signed' THEN
    RAISE EXCEPTION 'introducer_consent_docs: a signed consent form cannot be unsigned';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS introducer_consent_docs_guard ON introducer_consent_docs;
CREATE TRIGGER introducer_consent_docs_guard
  BEFORE UPDATE ON introducer_consent_docs
  FOR EACH ROW EXECUTE FUNCTION introducer_consent_docs_signed_guard();

-- Holds a third party's name, contact details and the consent they gave. Same
-- posture as every other introducer table: service-role only, anon key never.
ALTER TABLE introducer_consent_docs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE introducer_consent_docs IS
  'The client-signed Referral Consent and Privacy Form. One per referral, signed by every '
  'applicant. Carries the consent wording verbatim as at the moment of signing.';

-- ── The signature engine must accept it ──────────────────────────────────────
--
-- The engine renders, sends, captures and stores signed documents already; it
-- simply refuses doc types it does not know. Widen the CHECK.
--
-- REBUILT FROM THE FULL LIST, AND IT PICKS UP A GAP. The set as at 20260813 is
-- fact_find, needs_analysis, credit_authorisation and the three introducer
-- documents. 'eoi' is in SIGN_DOC_TYPES (utils/signatures.ts) but was never
-- added here — so sending an Expression of Interest for signature violates this
-- constraint and 500s at the insert. Unlike the audit trail below, that one
-- fails LOUDLY, which is presumably why nobody has hit it silently; it is
-- included now so it cannot bite later.
ALTER TABLE signature_requests DROP CONSTRAINT IF EXISTS signature_requests_doc_type_check;
ALTER TABLE signature_requests ADD CONSTRAINT signature_requests_doc_type_check
  CHECK (doc_type IN (
    'fact_find',
    'needs_analysis',
    'credit_authorisation',
    'eoi',
    'introducer_nda',
    'introducer_agreement',
    'introducer_schedule',
    'referral_consent'
  ));

-- ── And the audit trail must accept it. THIS ALSO FIXES A LIVE BUG. ─────────
--
-- compliance_document_audit carries its own doc_type CHECK, and it was last
-- widened for 'eoi' in 20260715_eois.sql. The three INTRODUCER documents added
-- on 2026-08-13 — nda, agreement, schedule — were never added to it.
--
-- recordAudit() is deliberately fail-open: the document write has already
-- committed, so a failed audit insert is logged and swallowed rather than
-- rethrown. The consequence is that every signature on an introducer NDA,
-- agreement or schedule since 13 August has recorded NO audit history and
-- emitted a `compliance_audit.record_failed` log nobody was reading. The
-- documents are fine; the trail behind them is empty.
--
-- So this rebuilds the constraint from the full current set rather than adding
-- one value: 'referral_consent' plus the three that should already have been
-- there. Same DO-block shape as the earlier wideners, so it is safe whether or
-- not the audit table exists yet.
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
        'referral_consent'
      ));
  end if;
end $$;
