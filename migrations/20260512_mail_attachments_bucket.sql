-- Mail Phase 1 slice 6 — Storage bucket for email attachments.
--
-- Private bucket: files are accessed via short-lived signed URLs only.
-- Brevo fetches attachments via the signed URL during send (1h TTL is
-- plenty for the send pipeline). Inbound attachments (Phase 2) land here
-- too via the Postmark webhook which posts the raw bytes.
--
-- Path convention: mail/{owner_user_email}/{email_kind}/{email_id}/{filename}
-- — owner-scoped so RLS can match storage path prefix → user identity.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mail-attachments',
  'mail-attachments',
  FALSE,
  25 * 1024 * 1024,  -- 25MB per attachment (Brevo limit is 10MB inline / much higher via URL)
  NULL                -- no MIME restriction — emails carry anything
)
ON CONFLICT (id) DO NOTHING;

-- Until we wire RLS per user, the service-role key in Next.js routes is the
-- sole writer. App code enforces ownership via email_attachments row checks
-- before generating signed URLs. RLS policies can be tightened later.
