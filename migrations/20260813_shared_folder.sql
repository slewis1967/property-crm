-- Shared Folder — an org-wide file library living inside the CRM.
--
-- WHY THIS EXISTS
-- The team needed "a folder that can be shared online with others in the
-- organisation", with everyone able to view AND edit. Rather than adding
-- another SaaS tool with its own accounts and its own share links, this rides
-- on the access control the CRM already has: every request to
-- crm.nextkey.com.au passes Cloudflare Access, so "everyone in the
-- organisation" is exactly the existing Access policy. Adding a colleague =
-- adding them to Access. There is no public link to leak and no second
-- password to manage.
--
-- SHAPE
-- One self-referencing table holds BOTH folders and files, the way a
-- filesystem does:
--   kind = 'folder'  → storage_path IS NULL, may have children
--   kind = 'file'    → points at exactly one object in the `shared-folder`
--                      bucket at path {id}/{safe-filename}
-- Keeping the id in the storage path means renaming a file is a pure DB
-- update: the object never moves, and the download route passes the display
-- name to createSignedUrl({ download }) so the browser still saves it under
-- the name the user sees.
--
-- DELETES ARE SOFT BY DEFAULT
-- This app has no per-user role model — any Cloudflare Access identity is a
-- full member — so anyone who can read the folder can also delete from it.
-- That makes an accidental "delete the whole 2026 folder" a real risk, so
-- DELETE sets deleted_at and the row lands in a Trash view anyone can restore
-- from. Permanent deletion (which also removes the storage objects) is a
-- separate, explicit action.
--
-- Deleting a FOLDER only stamps the folder itself; its children ride along
-- because they are no longer reachable from the tree. Restoring the folder
-- brings the whole subtree back intact. Search results are filtered in app
-- code so items sitting inside a trashed folder do not leak back into view.
--
-- Safe to apply before or after the code deploys: every route degrades
-- gracefully via sharedFolderTableMissing() while this is unapplied.

CREATE TABLE IF NOT EXISTS shared_folder_items (
  id            uuid PRIMARY KEY,
  parent_id     uuid REFERENCES shared_folder_items(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('folder', 'file')),
  name          text NOT NULL,
  storage_path  text,
  mime_type     text,
  size_bytes    bigint,
  -- 'pending' = row reserved and an upload URL handed out, bytes not yet
  -- confirmed. The listing only shows 'ready', so a browser that dies
  -- mid-upload leaves an invisible row rather than a broken download.
  status        text NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready')),
  deleted_at    timestamptz,
  created_by    text NOT NULL,
  updated_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- CREATE TABLE IF NOT EXISTS silently no-ops against a pre-existing table of
-- the same name (this project has been bitten by that before — see the
-- fact_finds note in CLAUDE.md). These ALTERs make the migration self-healing
-- and re-runnable either way.
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS parent_id    uuid REFERENCES shared_folder_items(id) ON DELETE CASCADE;
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS kind         text;
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS name         text;
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS mime_type    text;
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS size_bytes   bigint;
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'ready';
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS deleted_at   timestamptz;
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS created_by   text;
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS updated_by   text;
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS created_at   timestamptz NOT NULL DEFAULT now();
ALTER TABLE shared_folder_items ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now();

-- RLS ON, with NO policies — deliberately.
--
-- Every read and write goes through the Next.js routes using the service-role
-- key, which bypasses RLS entirely, so this costs the app nothing. What it
-- buys: NEXT_PUBLIC_SUPABASE_ANON_KEY ships to the browser, and a public-schema
-- table WITHOUT RLS is readable (and writable) by anyone holding that key
-- straight through PostgREST — completely bypassing the Cloudflare Access gate
-- that is the whole basis of this feature's access control. Default-deny closes
-- that door. Only add policies here if the browser ever needs to read this
-- table directly, which it currently does not.
ALTER TABLE shared_folder_items ENABLE ROW LEVEL SECURITY;

-- The listing query: "children of this folder, not trashed, ready".
CREATE INDEX IF NOT EXISTS shared_folder_items_parent_idx
  ON shared_folder_items (parent_id, kind, name)
  WHERE deleted_at IS NULL;

-- Root listing — parent_id IS NULL is not covered by the composite above on
-- every plan, and the root is the most-visited folder.
CREATE INDEX IF NOT EXISTS shared_folder_items_root_idx
  ON shared_folder_items (kind, name)
  WHERE parent_id IS NULL AND deleted_at IS NULL;

-- Cross-folder search (name ILIKE '%q%').
CREATE INDEX IF NOT EXISTS shared_folder_items_name_idx
  ON shared_folder_items (lower(name))
  WHERE deleted_at IS NULL;

-- The Trash view, newest first.
CREATE INDEX IF NOT EXISTS shared_folder_items_trash_idx
  ON shared_folder_items (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE shared_folder_items IS
  'Org-wide shared file library (folders + files) behind Cloudflare Access. Files point at the `shared-folder` Storage bucket; deletes are soft (deleted_at) with a Trash view.';
COMMENT ON COLUMN shared_folder_items.storage_path IS
  'NULL for folders. For files: {id}/{safe-filename} in the shared-folder bucket. Immutable — renames only change `name`.';
COMMENT ON COLUMN shared_folder_items.status IS
  'pending = upload URL issued, bytes unconfirmed. Listings show ready only.';

-- Private bucket: reachable only through short-lived signed URLs minted by
-- /api/shared-folder routes, which run behind Cloudflare Access. Nothing here
-- is ever public.
--
-- NOTE: 100MB is the per-file ceiling for this bucket, but Supabase also
-- enforces a PROJECT-WIDE upload limit (Dashboard → Storage → Settings →
-- "Upload file size limit"). If that is still at the 50MB default, raise it or
-- uploads over 50MB will fail at the PUT with a 413 regardless of this value.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shared-folder',
  'shared-folder',
  FALSE,
  100 * 1024 * 1024,  -- 100MB per file
  NULL                 -- general-purpose folder: no MIME restriction
)
ON CONFLICT (id) DO NOTHING;

-- No storage.objects RLS policies, matching 20260512_mail_attachments_bucket.
-- The service-role key used by the Next.js routes is the sole writer, and the
-- anon key (default-deny) can only ever touch a path it was handed a signed
-- token for. Access control is the Cloudflare Access gate in proxy.ts.
