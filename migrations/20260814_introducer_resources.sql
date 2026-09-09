-- The introducer document library.
--
-- Accredited introducers need the policy manual and the portal guide to hand,
-- permanently, not as an email attachment they received once during onboarding
-- and can no longer find. This is where those live.
--
-- WHY A LIBRARY TABLE AND NOT JUST A BUCKET LISTING. Three reasons, and each one
-- has bitten a document store somewhere:
--
--   1. A bucket listing publishes whatever happens to be in the bucket. A draft
--      dropped in for review would be live to every accredited introducer the
--      moment it finished uploading. Here a row must exist AND say published.
--   2. Filenames are not titles. The row carries the title, the description and
--      the ordering, so the library reads like a shelf rather than a directory.
--   3. Version. A compliance manual that is superseded is a different document,
--      and the acknowledgement below has to be able to tell them apart.
--
-- SEPARATE BUCKET FROM `introducer-records`. That bucket holds per-introducer
-- evidence -- certificates, identity, signed agreements -- and every read of it
-- is scoped to one application. This bucket is the opposite: one copy, read by
-- everybody. Keeping them apart means a path bug in the library can never
-- surface someone's licence photo, because the library never touches that
-- bucket's name.

CREATE TABLE IF NOT EXISTS introducer_resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stable handle used by the upload script to re-publish an updated document
  -- into the same row. Without it, a re-upload creates a second shelf entry and
  -- the old one stays visible next to it.
  slug        text NOT NULL UNIQUE,

  title       text NOT NULL,
  description text NOT NULL DEFAULT '',

  -- What kind of thing this is, so the shelf can be grouped. Constrained
  -- because an uncontrolled category becomes four spellings of "Marketing".
  category    text NOT NULL DEFAULT 'reference'
              CHECK (category IN ('manual','reference','agreement','marketing')),

  storage_path text NOT NULL,
  filename     text NOT NULL,
  mime_type    text NOT NULL DEFAULT 'application/pdf',
  size_bytes   bigint,

  -- Free text ("1.0", "Aug 2026"). Displayed, and it keys acknowledgements.
  version      text NOT NULL DEFAULT '1.0',

  -- Defaults to FALSE on purpose. A row created by an interrupted upload, or by
  -- someone staging next quarter's manual, is invisible until a human says
  -- otherwise. The failure mode of the other default is publishing an unfinished
  -- compliance document to every accredited introducer.
  published    boolean NOT NULL DEFAULT false,

  -- Set on a document an introducer must confirm they have read. The manual is
  -- one; the portal guide is not.
  requires_ack boolean NOT NULL DEFAULT false,

  sort_order   integer NOT NULL DEFAULT 100,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS introducer_resources_shelf_idx
  ON introducer_resources (published, category, sort_order);

CREATE OR REPLACE FUNCTION introducer_resources_touch_updated_at() RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS introducer_resources_set_updated_at ON introducer_resources;
CREATE TRIGGER introducer_resources_set_updated_at
  BEFORE UPDATE ON introducer_resources
  FOR EACH ROW EXECUTE FUNCTION introducer_resources_touch_updated_at();

-- "Yes, I have read the current policy manual."
--
-- KEYED ON VERSION, NOT JUST THE DOCUMENT. This is the entire point. An
-- acknowledgement of version 1.0 is not an acknowledgement of the version that
-- replaced it, and an audit that cannot tell those apart is an audit that proves
-- nothing. Publishing 1.1 silently un-acknowledges everyone, which is the
-- correct and intended consequence.
CREATE TABLE IF NOT EXISTS introducer_resource_acks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT, not CASCADE, and the two must agree with the append-only trigger
  -- below. A cascade would delete evidence as a side effect of tidying up a
  -- shelf entry -- and, because the trigger refuses the delete anyway, would
  -- surface as an unexplained trigger exception from a statement that never
  -- mentioned this table. RESTRICT fails honestly instead.
  --
  -- The consequence is deliberate: a resource that has been acknowledged cannot
  -- be deleted. Retire it by setting published = false. An acknowledgement is a
  -- record of a compliance obligation being met and is retained on the same
  -- footing as introducer_events.
  resource_id    uuid NOT NULL REFERENCES introducer_resources(id) ON DELETE RESTRICT,
  introducer_id  uuid NOT NULL REFERENCES introducers(id) ON DELETE RESTRICT,

  -- Snapshotted, not joined. If the row's version later changes, this record
  -- must keep saying which version was actually confirmed.
  version        text NOT NULL,

  -- Evidence, on the same footing as a signature: who, when, from where.
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by text,
  ip              text,
  user_agent      text,

  UNIQUE (resource_id, introducer_id, version)
);

CREATE INDEX IF NOT EXISTS introducer_resource_acks_firm_idx
  ON introducer_resource_acks (introducer_id, acknowledged_at DESC);

-- An acknowledgement is evidence. Evidence that can be edited afterwards is not
-- evidence, so this table takes the same append-only trigger as the event log.
-- Withdrawing one is done by publishing a new version, not by deleting the row.
CREATE OR REPLACE FUNCTION introducer_resource_acks_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'introducer_resource_acks is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS introducer_resource_acks_no_update ON introducer_resource_acks;
CREATE TRIGGER introducer_resource_acks_no_update
  BEFORE UPDATE OR DELETE ON introducer_resource_acks
  FOR EACH ROW EXECUTE FUNCTION introducer_resource_acks_append_only();

-- Consistent with every other introducer table: RLS on, no policies, so the
-- anon and authenticated keys reach nothing and only the service role -- which
-- is server-side and session-checked -- can read it.
ALTER TABLE introducer_resources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE introducer_resource_acks ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'introducer-library', 'introducer-library', false, 26214400,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE introducer_resources IS
  'Shelf of documents published to accredited introducers. A file in the introducer-library bucket is invisible until a published row here points at it.';
COMMENT ON TABLE introducer_resource_acks IS
  'Append-only record that an introducer confirmed reading a specific VERSION of a resource. Publishing a new version deliberately voids prior acknowledgements.';
