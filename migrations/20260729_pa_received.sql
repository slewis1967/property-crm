-- When the Preliminary Assessment comes BACK from Your Loan Assist.
--
-- The CRM already stamps the PA going OUT (yla_submitted_at) and whether the
-- package verified (verification_status). It had no idea when YLA returned the
-- assessment, which is the point at which the client's structure is actually
-- settled and a director ID becomes a real, correct instruction.
--
-- Gating on this matters: before the PA is back we do not reliably know the fund
-- will have a corporate trustee. Telling a client to obtain a director ID at that
-- stage risks sending them after a government identifier they may never need.
--
-- NULL = not back yet. Safe default for every existing row, so applying this
-- migration hides the walkthrough everywhere until a rep explicitly marks the
-- PA as received.

ALTER TABLE document_requests
  ADD COLUMN IF NOT EXISTS pa_received_at timestamptz;

ALTER TABLE document_requests
  ADD COLUMN IF NOT EXISTS pa_received_by text;

COMMENT ON COLUMN document_requests.pa_received_at IS
  'When the Preliminary Assessment came back from YLA. NULL = not yet received. Gates the director ID walkthrough.';
COMMENT ON COLUMN document_requests.pa_received_by IS
  'CF Access identity of the rep who marked the PA received, for audit.';
