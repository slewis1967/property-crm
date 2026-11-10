-- Sending identity on email drafts.
--
-- The composer can now send/reply as one of several verified Brevo senders
-- (NextKey or Springboard). Persist the chosen identity on the draft so the
-- send path can resolve the correct `from` envelope + per-identity signature.
--
-- Idempotent + graceful if unrun: the column defaults to 'nextkey', and all
-- read paths treat a missing column/value as 'nextkey', so nothing breaks if
-- this migration has not yet been applied.

ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS from_identity text NOT NULL DEFAULT 'nextkey';
