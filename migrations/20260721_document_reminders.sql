-- Document-collection reminder engine.
--
-- Nudges a client (per applicant request) to finish uploading their YLA
-- Preliminary Assessment documents, framed around YLA's weekly Thursday
-- assessment cutoff. The scheduler is idempotent and self-throttling: at most
-- one reminder per request per day, and it stops the moment a request is
-- submitted / cancelled / expired. See utils/document-reminders.ts.
--
-- SENSITIVITY: reminders reference an in-flight application but never the
-- document contents. Each reminder mints a FRESH portal token (the raw token is
-- only ever in the emailed/SMSed link; we keep the SHA-256 hash), which also
-- expires any earlier link — a leaked old link can't be replayed.

ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS last_reminder_at   timestamptz;
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS reminder_count     int NOT NULL DEFAULT 0;
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS last_reminder_kind text;
-- Client-level suppression for reminders specifically (distinct from the
-- channel-level sms_opt_outs, which sendSms already honours). Lets a rep stop
-- nagging one applicant without cancelling their request.
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS reminders_opted_out boolean NOT NULL DEFAULT false;

-- The scheduler scans open requests by age; keep that scan cheap.
CREATE INDEX IF NOT EXISTS document_requests_reminder_scan_idx
  ON document_requests (status, last_reminder_at);

-- Audit log of every reminder actually sent (or attempted). One row per
-- channel per send. Independent of sms_log / Brevo so the reminder history is
-- queryable in one place and a resend can be reasoned about.
CREATE TABLE IF NOT EXISTS document_reminder_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES document_requests(id) ON DELETE CASCADE,
  kind         text NOT NULL,             -- nudge1 | nudge2 | nudge3 | cutoff
  channel      text NOT NULL,             -- email | sms
  recipient    text,                      -- email address or phone (E.164)
  status       text NOT NULL,             -- sent | failed | skipped
  error        text,
  dry_run      boolean NOT NULL DEFAULT false,
  sent_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_reminder_log_request_idx ON document_reminder_log (request_id);
CREATE INDEX IF NOT EXISTS document_reminder_log_sent_idx    ON document_reminder_log (sent_at);

COMMENT ON TABLE document_reminder_log IS
  'Audit trail of document-collection reminders (email/SMS) sent per applicant request.';
