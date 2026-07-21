-- Client document portal — collects the Preliminary Assessment document set
-- from a borrower and hands it to Your Loan Assist as a Google Drive link.
--
-- YLA's minimum set (email to Glenn, 2026-07-20), per applicant where noted:
--   CNA / Fact Find                              x1
--   Recent payslips                              x2 per applicant
--   Photo ID (licence = front AND back)          x1 per applicant
--   ATO Income Statement, previous + current FY  x2
--   Credit File authorisation, signed by all     x1
--   Most recent Super Statement                  x1 per applicant
--
-- YLA reject the whole set if anything is missing or below their document
-- standard (PDF, <1MB, named to reflect the document, no phone screenshots,
-- not rotated, not password-locked). A rejected set costs a full week —
-- submitted Thursday, assessed the Thursday after. Hence the portal: it
-- normalises on the client's own device before anything reaches us.
--
-- SENSITIVITY: this table points at payslips, photo ID and super statements.
-- That is sensitive personal information. Access is via short-lived signed
-- URLs only; the bucket is private and the service-role key is the sole writer.
-- Do NOT surface a document request before the lead has reached fact-find /
-- PA stage — AUSTRAC initial CDD is not due at enquiry, so collecting ID at
-- enquiry would be Privacy Act exposure with no AML justification.

-- ── Portal sessions ──────────────────────────────────────────────────────────
-- One row per client we are collecting documents from. The raw token lives ONLY
-- in the emailed/SMSed link; we store its SHA-256 hash, same posture as
-- signature_requests (utils/sign-token.ts). A DB leak cannot be replayed as a
-- portal link.
CREATE TABLE IF NOT EXISTS document_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash       text NOT NULL UNIQUE,

  -- Who this is for. Soft FKs throughout: opportunities live in NEXUS, not
  -- Supabase, so referential integrity is not available (same posture as
  -- deal_packets.opportunity_id and borrower_fact_finds.contact_id).
  applicant_name   text NOT NULL,
  applicant_email  text,
  applicant_phone  text,
  applicant_count  int  NOT NULL DEFAULT 1 CHECK (applicant_count BETWEEN 1 AND 4),
  opportunity_id   text,
  contact_id       text,
  fact_find_id     uuid,

  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','submitted','cancelled','expired')),

  -- Google Drive handoff. Populated when the rep exports to Drive.
  drive_folder_id  text,
  drive_folder_url text,
  submitted_at     timestamptz,       -- exported to Drive
  yla_submitted_at timestamptz,       -- included in a weekly YLA calendar entry

  created_by       text,
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotent add for tables created before yla_submitted_at existed (this
-- migration was applied once without it). Safe to run repeatedly.
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS yla_submitted_at timestamptz;

CREATE INDEX IF NOT EXISTS document_requests_token_hash_idx ON document_requests (token_hash);
CREATE INDEX IF NOT EXISTS document_requests_status_idx     ON document_requests (status);
CREATE INDEX IF NOT EXISTS document_requests_opportunity_idx ON document_requests (opportunity_id);

-- ── Uploaded documents ───────────────────────────────────────────────────────
-- doc_type is a free-text slug rather than an enum so YLA can change their
-- required set without a migration. The canonical list lives in
-- utils/yla-documents.ts — keep the two in step.
CREATE TABLE IF NOT EXISTS client_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       uuid NOT NULL REFERENCES document_requests(id) ON DELETE CASCADE,

  doc_type         text NOT NULL,
  -- 1-based applicant this document belongs to; NULL for whole-application
  -- documents (fact find, ATO statements, credit authorisation).
  applicant_index  int CHECK (applicant_index IS NULL OR applicant_index BETWEEN 1 AND 4),

  -- The YLA-compliant name we generated, e.g. "Payslip 1 - Smith.pdf".
  filename         text NOT NULL,
  original_name    text,
  storage_path     text NOT NULL,
  mime_type        text,
  size_bytes       bigint,

  -- Result of the automated standard check. 'accepted' means it passed
  -- everything we can machine-verify; a human still confirms legibility and
  -- that e.g. the ATO statements really cover both financial years.
  status           text NOT NULL DEFAULT 'uploaded'
                     CHECK (status IN ('uploaded','accepted','rejected','replaced')),
  check_notes      text,

  uploaded_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_documents_request_idx ON client_documents (request_id);
CREATE INDEX IF NOT EXISTS client_documents_type_idx    ON client_documents (request_id, doc_type, applicant_index);

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- Private. 15MB ceiling is generous versus YLA's 1MB final limit: the client
-- may upload a large phone photo and the browser normalises it down before we
-- ever store it, but we accept a big original rather than rejecting outright.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-documents',
  'client-documents',
  FALSE,
  15 * 1024 * 1024,
  ARRAY['application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- No RLS policies: the anon key must never touch this bucket. Every read and
-- write goes through a Next.js route holding the service-role key, which
-- validates the portal token (public routes) or the CF Access identity (rep
-- routes) before minting a short-lived signed URL. Matches mail-attachments.

COMMENT ON TABLE document_requests IS
  'Client document-collection sessions for the YLA Preliminary Assessment. Raw portal token is never stored — only its SHA-256 hash.';
COMMENT ON TABLE client_documents IS
  'Documents uploaded by a borrower via the public portal. Points at sensitive PII (payslips, photo ID, super statements) — signed-URL access only.';
