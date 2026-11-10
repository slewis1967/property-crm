-- Log of Fact Find → broker submissions (one row per send). Lets the Fact Find
-- show "sent to <broker> on <date>". The email is the action; this is the audit.
CREATE TABLE IF NOT EXISTS broker_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_find_id  uuid NOT NULL,          -- soft FK to borrower_fact_finds
  broker_id     text,
  broker_name   text,
  broker_email  text,
  reference     text,
  submitted_by  text,
  submitted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS broker_submissions_ff_idx ON broker_submissions (fact_find_id, submitted_at DESC);
