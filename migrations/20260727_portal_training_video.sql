-- Agent-gated training video on the client document portal.
--
-- The director ID walkthrough is NOT shown to a client automatically. A rep
-- releases it per request, because it is only relevant once we know that
-- client is going down the corporate-trustee SMSF path — showing it to
-- everyone would tell some clients to go and get a number they do not need.
--
-- Null released_at = not visible. That is the safe default for every existing
-- row, so applying this migration reveals nothing to anyone.

ALTER TABLE document_requests
  ADD COLUMN IF NOT EXISTS training_video_released_at timestamptz;

ALTER TABLE document_requests
  ADD COLUMN IF NOT EXISTS training_video_released_by text;

COMMENT ON COLUMN document_requests.training_video_released_at IS
  'When a rep released the director ID walkthrough to this client. NULL = hidden.';
COMMENT ON COLUMN document_requests.training_video_released_by IS
  'CF Access identity of the rep who released it, for audit.';
