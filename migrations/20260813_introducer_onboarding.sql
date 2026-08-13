-- Introducer onboarding - the pipeline that runs BEFORE an introducer exists.
--
-- Until now `introducers` was created by hand from /admin/introducers, and
-- creating it granted portal access immediately. That is the wrong order: a firm
-- should reach the portal only after it has signed an NDA, proved who it is,
-- passed the accreditation exam and signed the referral agreement. This table is
-- that runway. `introducers` becomes the DESTINATION, written once at the end.
--
-- FOUR RULES THIS SCHEMA EXISTS TO ENFORCE
--
--   1. ONE TOKEN, ONE APPLICANT. Every candidate-facing step - the roadmap, the
--      NDA, the ID upload, the exam link - is reached with the same onboarding
--      token. Only its SHA-256 hash is stored, exactly as the portal login and
--      the e-signature flow do, so a database leak yields hashes and not links.
--
--   2. THE STATE IS THE GATE. `state` is not a label the UI paints; it is what
--      every route checks before it will do anything. A candidate who has not
--      reached `id_verified` cannot be issued an exam invite, whatever link they
--      hold.
--
--   3. NO SELF-DECLARED IDENTITY. `legal_name` and the rest are entered by staff
--      when the application is started, and are what the exam invite is signed
--      with. The candidate never types the name that ends up on their
--      certificate. (See the invite minting in utils/introducer-onboarding.ts
--      and the verifier in the accreditation site's netlify/functions/exam.mjs.)
--
--   4. ACTIVATION IS ONE-WAY AND RECORDED. `introducer_id` is null for the whole
--      pipeline and set exactly once, at activation. A row with `introducer_id`
--      set is history; the trigger below stops it being edited back into the
--      pipeline.
--
-- SENSITIVITY: this table and its documents hold identity evidence - driver
-- licence images, front and back. That is sensitive information under the
-- Privacy Act, collected for the single purpose of verifying an introducer's
-- identity before accreditation. Per Sean's decision (2026-08-13) images are
-- retained for the LIFE of the accreditation and deleted at termination - see
-- `purge_introducer_identity_documents()` at the foot of this file, which
-- offboarding must call. Storage is a private bucket, service-role only, with
-- every read signed and logged. The anon key must never reach any of it.

-- -- Applications ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS introducer_applications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Set ONLY at activation, when the firm and login rows are finally created.
  -- Null for the entire pipeline. See introducer_applications_activation_guard.
  introducer_id       uuid REFERENCES introducers(id) ON DELETE SET NULL,

  -- Identity as WE state it. This is what the exam invite is signed with and
  -- what the certificate prints. The candidate cannot edit any of it.
  legal_name          text NOT NULL,
  email               text NOT NULL,
  firm_name           text,
  abn                 text,
  phone               text,

  -- Tier 1 only for now. Tier 2 carries unresolved licensing exposure (it
  -- collects a fact find and an NCCP needs analysis, which reads as credit
  -- assistance) so it is deliberately not offerable until that advice lands.
  -- The CHECK is the enforcement, not a comment.
  tier                text NOT NULL DEFAULT 't1' CHECK (tier IN ('t1')),

  -- The pipeline. Forward-only in practice; the app never moves a row back
  -- except via an explicit staff action that is written to introducer_events.
  state               text NOT NULL DEFAULT 'invited' CHECK (state IN (
                        'invited',          -- created; flyer + NDA link sent
                        'nda_signed',       -- mutual NDA executed
                        'id_uploaded',      -- licence front and back received
                        'id_verified',      -- DVS check passed, or staff cleared it
                        'course_started',   -- exam invite issued
                        'exam_passed',      -- webhook recorded a pass
                        'certificate_issued',
                        'agreement_sent',   -- referral agreement + schedule out for signature
                        'agreement_signed',
                        'activated',        -- introducer + login created, portal open
                        'withdrawn'         -- staff stopped it; terminal
                      )),

  -- One credential for the whole runway. Rotatable: reissuing mints a new token
  -- and a new expiry without disturbing the application's state.
  token_hash          text NOT NULL UNIQUE,
  token_expires_at    timestamptz NOT NULL,

  -- Identity verification. `id_check_provider` names whoever answered - a
  -- DVS-backed service, or 'staff' when a human cleared it after the service
  -- failed or errored. Both paths are recorded; neither is assumed.
  id_check_provider   text,
  id_check_reference  text,
  id_check_result     text CHECK (id_check_result IN ('pass','fail','error','manual_pass','manual_fail')),
  id_checked_at       timestamptz,
  id_checked_by       text,

  -- Accreditation. `accreditation_no` is allocated once, at pass, from the
  -- sequence below - never derived from a count, which would collide the moment
  -- two candidates finished together.
  exam_paper_id       text,
  exam_score          int,
  exam_total          int,
  exam_passed_at      timestamptz,
  accreditation_no    text UNIQUE,
  certificate_path    text,

  -- Signatures. Each points at a row in signature_requests once that document
  -- has been sent for signing.
  nda_signature_id        uuid,
  agreement_signature_id  uuid,
  schedule_signature_id   uuid,

  notes               text,               -- internal only; never shown to the candidate
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  activated_at        timestamptz,
  withdrawn_at        timestamptz,
  withdrawn_reason    text
);

-- One live application per email. Withdrawn rows are excluded so a candidate who
-- was stopped can be invited again later without first deleting history.
CREATE UNIQUE INDEX IF NOT EXISTS introducer_applications_live_email_idx
  ON introducer_applications (lower(email))
  WHERE state <> 'withdrawn';

CREATE INDEX IF NOT EXISTS introducer_applications_state_idx
  ON introducer_applications (state);
CREATE INDEX IF NOT EXISTS introducer_applications_introducer_idx
  ON introducer_applications (introducer_id);

-- Accreditation numbers: SBI-2026-0001. A sequence, so two candidates finishing
-- in the same second cannot be handed the same number.
CREATE SEQUENCE IF NOT EXISTS introducer_accreditation_seq START 1;

-- -- Identity documents -------------------------------------------------------
-- Separate from introducer_documents, which is keyed to a client REFERRAL and
-- is reply-only. These belong to the applicant themselves and exist before any
-- referral does.
CREATE TABLE IF NOT EXISTS introducer_identity_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    uuid NOT NULL REFERENCES introducer_applications(id) ON DELETE CASCADE,

  -- Exactly two are expected. The CHECK stops a third slot being invented by a
  -- caller passing an arbitrary label.
  side              text NOT NULL CHECK (side IN ('front','back')),

  filename          text NOT NULL,
  original_name     text,
  storage_path      text NOT NULL,
  mime_type         text,
  size_bytes        bigint,

  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  -- Set when the image itself is destroyed at offboarding. The ROW survives so
  -- the file remains auditable as having existed and been checked, which is the
  -- point of keeping a verification record without keeping a licence library.
  purged_at         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS introducer_identity_documents_slot_idx
  ON introducer_identity_documents (application_id, side)
  WHERE purged_at IS NULL;

-- -- Guards --------------------------------------------------------------------

-- Activation is one-way. Once introducer_id is set the application is history:
-- it may still be annotated, but it cannot be detached from its firm or walked
-- back into the pipeline. Enforced here rather than in a route handler because a
-- bug in a route handler must not be able to do it either.
CREATE OR REPLACE FUNCTION introducer_applications_activation_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.introducer_id IS NOT NULL AND NEW.introducer_id IS DISTINCT FROM OLD.introducer_id THEN
    RAISE EXCEPTION 'introducer_applications: introducer_id is set once at activation and cannot be changed';
  END IF;

  IF OLD.state = 'activated' AND NEW.state <> 'activated' THEN
    RAISE EXCEPTION 'introducer_applications: an activated application cannot re-enter the pipeline';
  END IF;

  -- Accreditation numbers are permanent. Reissuing a certificate reuses the
  -- number; it never allocates a second one.
  IF OLD.accreditation_no IS NOT NULL AND NEW.accreditation_no IS DISTINCT FROM OLD.accreditation_no THEN
    RAISE EXCEPTION 'introducer_applications: accreditation_no cannot be changed once allocated';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS introducer_applications_guard ON introducer_applications;
CREATE TRIGGER introducer_applications_guard
  BEFORE UPDATE ON introducer_applications
  FOR EACH ROW EXECUTE FUNCTION introducer_applications_activation_guard();

-- -- Offboarding ----------------------------------------------------------------
-- Sean's retention decision: licence images live for the life of the
-- accreditation and are destroyed when the introducer is terminated. Call this
-- from the termination path. It marks the rows purged and returns the storage
-- paths for the caller to delete from the bucket - SQL cannot remove the object
-- itself, and silently leaving the file behind while the row claims it is gone
-- would be worse than not having the function.
-- The OUT column is deliberately NOT called storage_path: an OUT parameter that
-- shares a name with a column of the table being updated is ambiguous inside
-- plpgsql, and the failure is a runtime error on a path that only runs at
-- offboarding - i.e. the worst possible time to discover it.
CREATE OR REPLACE FUNCTION purge_introducer_identity_documents(p_introducer_id uuid)
RETURNS TABLE (purged_path text) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE introducer_identity_documents d
     SET purged_at = now()
    FROM introducer_applications a
   WHERE d.application_id = a.id
     AND a.introducer_id = p_introducer_id
     AND d.purged_at IS NULL
  RETURNING d.storage_path;
END;
$$;

-- -- Access ----------------------------------------------------------------------
-- Service-role only, matching every other introducer table: RLS on, no policies,
-- so the anon key sees nothing at all.
ALTER TABLE introducer_applications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE introducer_identity_documents  ENABLE ROW LEVEL SECURITY;

-- Private bucket for identity evidence. Deliberately NOT the introducer-documents
-- bucket: that one holds client referral attachments and is reachable by an
-- introducer session. Nothing in here is ever reachable by an introducer.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'introducer-identity', 'introducer-identity', false, 15728640,
  ARRAY['application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- -- Signature documents ---------------------------------------------------------
-- The e-signature engine already renders, sends, captures and stores signed PDFs;
-- it simply refuses documents it does not know about. Widen the CHECK so it will
-- carry the three introducer documents. Nothing else about that flow changes.
ALTER TABLE signature_requests DROP CONSTRAINT IF EXISTS signature_requests_doc_type_check;
ALTER TABLE signature_requests ADD CONSTRAINT signature_requests_doc_type_check
  CHECK (doc_type IN (
    'fact_find','needs_analysis','credit_authorisation',
    'introducer_nda','introducer_agreement','introducer_schedule'
  ));
