-- YLA submission verification state on document_requests.
-- Records the verification agent's verdict so the auto-submit sweep can tell
-- which applications are cleared to send, which failed (and why), and which are
-- already with YLA. Idempotent.

ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS verification_status text;   -- null | 'passed' | 'failed'
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS verified_at         timestamptz;
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS verification_issues jsonb;   -- [{filename, applicant, issues[]}]
-- yla_submitted_at already exists (weekly-entry marker); reused as the "sent to YLA" stamp.

CREATE INDEX IF NOT EXISTS document_requests_verification_idx
  ON document_requests (verification_status, yla_submitted_at);
