-- Mail Migration Phase 1 — schema for Outlook-grade email UX in the CRM.
--
-- All inbound and outbound mail already lives in email_log (unified table,
-- direction='inbound'|'outbound'). Phase 1 adds the columns + tables the
-- CRM needs to be a real email client BEFORE the MX swap to Postmark.
-- Inbound is still served by the Gmail OAuth poll until Phase 3 cutover.
--
-- See docs/MAIL_MIGRATION.md §4 for the design.

-- ── 1. email_log column additions ──────────────────────────────────────────

ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS owner_user_email TEXT,                 -- per-user inbox routing
  ADD COLUMN IF NOT EXISTS folder_id        UUID,                  -- nullable = Inbox
  ADD COLUMN IF NOT EXISTS labels           TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_read          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_starred       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_archived      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_trashed       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_spam          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS spam_score       NUMERIC,                -- populated by Postmark in Phase 2
  ADD COLUMN IF NOT EXISTS body_search      TSVECTOR;

-- Per-user inbox listing — by far the hottest query path.
CREATE INDEX IF NOT EXISTS email_log_owner_idx
  ON public.email_log (owner_user_email, sent_at DESC NULLS LAST)
  WHERE is_trashed = FALSE AND is_spam = FALSE;

-- Folder browsing
CREATE INDEX IF NOT EXISTS email_log_folder_idx
  ON public.email_log (folder_id, sent_at DESC NULLS LAST);

-- Labels are GIN-indexed for `labels @> ARRAY[...]` queries
CREATE INDEX IF NOT EXISTS email_log_labels_idx
  ON public.email_log USING GIN (labels);

-- Full-text search across subject, body, from/to addresses
CREATE INDEX IF NOT EXISTS email_log_search_idx
  ON public.email_log USING GIN (body_search);

-- ── 2. body_search tsvector trigger ────────────────────────────────────────
--
-- Maintain body_search automatically on insert/update of the source columns.
-- Use a generated tsvector instead of a TRIGGER if you'd rather — both work.
-- We use a trigger because the existing rows need backfilling and a trigger
-- handles the backfill UPDATE in one pass via the touch below.

CREATE OR REPLACE FUNCTION public.email_log_search_refresh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.body_search :=
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')),         'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.from_email, '')),      'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.to_email, '')),        'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.body_text, '')),       'C');
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS email_log_search_update ON public.email_log;
CREATE TRIGGER email_log_search_update
  BEFORE INSERT OR UPDATE OF subject, from_email, to_email, body_text
  ON public.email_log
  FOR EACH ROW EXECUTE FUNCTION public.email_log_search_refresh();

-- Backfill existing rows — touch each row so the trigger fires.
UPDATE public.email_log
  SET subject = subject
  WHERE body_search IS NULL;

-- ── 3. New tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_folders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_email  TEXT NOT NULL,
  name              TEXT NOT NULL,
  parent_id         UUID REFERENCES public.email_folders(id) ON DELETE CASCADE,
  -- Visual hint for the sidebar — picked from a small palette in the UI
  color             TEXT,
  -- System folders (Inbox, Sent, Drafts, Trash, Spam) are seeded per-user
  -- and can't be renamed/deleted. user-created folders have system=FALSE.
  system            BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_user_email, name, parent_id)
);

CREATE INDEX IF NOT EXISTS email_folders_owner_idx
  ON public.email_folders (owner_user_email, parent_id NULLS FIRST, name);

CREATE TABLE IF NOT EXISTS public.email_drafts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_email    TEXT NOT NULL,
  to_addresses        TEXT[] DEFAULT '{}',
  cc_addresses        TEXT[] DEFAULT '{}',
  bcc_addresses       TEXT[] DEFAULT '{}',
  subject             TEXT,
  body_html           TEXT,
  -- Reply context: id of the email_log row we're replying to, plus the
  -- thread_id (matches email_log.thread_id) so the draft surfaces alongside
  -- the existing conversation in the inbox view.
  reply_to_email_id   UUID,
  thread_id           TEXT,
  attachments         JSONB DEFAULT '[]'::jsonb,  -- [{filename, size, storage_path, mime}]
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_drafts_owner_idx
  ON public.email_drafts (owner_user_email, updated_at DESC);

CREATE INDEX IF NOT EXISTS email_drafts_thread_idx
  ON public.email_drafts (thread_id)
  WHERE thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Single attachment can belong to an email_log row OR an email_draft.
  -- email_kind says which table email_id refers to. No FK by design — the
  -- aggregator pulls Brevo events into email_log for inbound and we don't
  -- want a cascade behaviour to clean up live mail.
  email_id      UUID NOT NULL,
  email_kind    TEXT NOT NULL CHECK (email_kind IN ('inbound', 'outbound', 'draft')),
  filename      TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  storage_path  TEXT NOT NULL,                  -- bucket/object path inside Supabase Storage
  -- Inbound attachments may have a content-id used for inline images. Keep
  -- it so the UI can rewrite <img src="cid:..."> to storage URLs.
  content_id    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_attachments_email_idx
  ON public.email_attachments (email_kind, email_id);

-- ── 4. User alias map — drives owner_user_email derivation ────────────────
--
-- The /api/mail/inbound webhook (Phase 2) and the Gmail OAuth poll (today)
-- both call resolve_email_owner(to_email, cc) and stamp the result onto the
-- email_log row. user_email is the canonical address; aliases are the
-- additional addresses that route to the same person.

CREATE TABLE IF NOT EXISTS public.email_user_aliases (
  user_email    TEXT PRIMARY KEY,
  display_name  TEXT,
  aliases       TEXT[] DEFAULT '{}',
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.email_user_aliases (user_email, display_name, aliases) VALUES
  ('sean.l@nextkey.com.au',  'Sean Lewis',  '{}'),
  ('glenn.m@nextkey.com.au', 'Glenn Mercer', '{}')
ON CONFLICT (user_email) DO NOTHING;

-- ── 5. Backfill owner_user_email on existing rows ─────────────────────────
--
-- For now: anything to/from sean.l@ → Sean; to/from glenn.m@ → Glenn.
-- Once additional aliases are populated in email_user_aliases, the
-- application's resolver does the smarter match; this backfill is just a
-- one-off so existing mail shows up under the right user.

UPDATE public.email_log
  SET owner_user_email = 'sean.l@nextkey.com.au'
  WHERE owner_user_email IS NULL
    AND (to_email   ILIKE '%sean.l@nextkey.com.au%'
      OR from_email ILIKE '%sean.l@nextkey.com.au%');

UPDATE public.email_log
  SET owner_user_email = 'glenn.m@nextkey.com.au'
  WHERE owner_user_email IS NULL
    AND (to_email   ILIKE '%glenn.m@nextkey.com.au%'
      OR from_email ILIKE '%glenn.m@nextkey.com.au%');

-- ── 6. Seed system folders per user ───────────────────────────────────────
--
-- Each user gets the standard set on first login; doing it here means the
-- sidebar UI can rely on these existing without a fallback path.

INSERT INTO public.email_folders (owner_user_email, name, system) VALUES
  ('sean.l@nextkey.com.au',  'Inbox',   TRUE),
  ('sean.l@nextkey.com.au',  'Sent',    TRUE),
  ('sean.l@nextkey.com.au',  'Drafts',  TRUE),
  ('sean.l@nextkey.com.au',  'Archive', TRUE),
  ('sean.l@nextkey.com.au',  'Trash',   TRUE),
  ('sean.l@nextkey.com.au',  'Spam',    TRUE),
  ('glenn.m@nextkey.com.au', 'Inbox',   TRUE),
  ('glenn.m@nextkey.com.au', 'Sent',    TRUE),
  ('glenn.m@nextkey.com.au', 'Drafts',  TRUE),
  ('glenn.m@nextkey.com.au', 'Archive', TRUE),
  ('glenn.m@nextkey.com.au', 'Trash',   TRUE),
  ('glenn.m@nextkey.com.au', 'Spam',    TRUE)
ON CONFLICT (owner_user_email, name, parent_id) DO NOTHING;
