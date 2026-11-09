-- Rep overrides on the YLA document check.
--
-- Two things the rep could not do when the AI check rejected a file: dismiss a
-- verdict they judge wrong, and remove a file the client should never have sent
-- (NK-10017, Sept 2026 — a super statement uploaded into an ATO slot sat there
-- with no way to clear it, and the whole household stalled behind it).
--
-- The dismissal lives on the DOCUMENT, not the request, so it stays attached to
-- the exact bytes a human looked at: a re-verification honours it, and a
-- replacement upload — a new row — starts unjudged, as it must. Idempotent.

ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS check_override_by text;         -- rep's email
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS check_override_at timestamptz;  -- when it was dismissed

-- Verification reads every live document of a request and needs to know, in the
-- same pass, which ones carry a dismissal.
CREATE INDEX IF NOT EXISTS client_documents_override_idx
  ON client_documents (request_id, check_override_at);
