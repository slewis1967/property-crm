-- Destination for a document-collection application: YLA (default) or a broker.
-- The auto-submit sweep routes a completed+verified set to whichever is set —
-- YLA gets the .ics calendar invite, a broker gets the Fact Find + Drive link.
-- A broker snapshot (name/email/reference) is stored at request time so the
-- submission is stable even if the broker is later edited or removed in Settings.
-- Idempotent.

ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS submit_target    text NOT NULL DEFAULT 'yla'; -- 'yla' | 'broker'
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS broker_id        text;
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS broker_name      text;
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS broker_email     text;
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS broker_reference text;

-- Any pre-existing request predates this and is YLA-bound.
UPDATE document_requests SET submit_target = 'yla' WHERE submit_target IS NULL;
