-- Per-user email signatures.
--
-- Until today the CRM had one signature shared across both Sean and Glenn
-- (single row in app_settings, key='email_signature'). Now that the inbox
-- routes per-user, each owner needs their own signature so the recipient
-- sees the actual sender's details — not whichever sig was last edited.
--
-- Storage: signature JSONB on email_user_aliases (already keyed per user).
-- Resolver order (utils/email-signature.ts): per-user JSONB → legacy
-- app_settings → env vars → hardcoded defaults.

ALTER TABLE public.email_user_aliases
  ADD COLUMN IF NOT EXISTS signature JSONB;

-- One-time backfill: copy the existing shared signature onto Sean's row so
-- his outbound mail keeps its current sig. Glenn's row stays NULL and will
-- get filled in via the Settings UI on first edit.
UPDATE public.email_user_aliases
SET signature = (
  SELECT value FROM public.app_settings WHERE key = 'email_signature'
)
WHERE user_email = 'sean.l@nextkey.com.au'
  AND signature IS NULL
  AND EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'email_signature');
