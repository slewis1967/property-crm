-- A referral can be deleted; its audit trail cannot.
--
-- THE BUG. `introducer_events.client_id` cascades on delete, and
-- `introducer_events_append_only()` is a BEFORE UPDATE OR DELETE trigger that
-- raises on any DELETE. So deleting a referral cascades into the events table
-- and the trigger refuses — which aborts the whole statement.
--
-- Every referral has an event from the moment it exists: the create route
-- writes `draft_created`. So NO referral has ever been deletable, including the
-- drafts that DELETE /api/introducer/clients/<id> exists specifically to
-- discard. That route has been unable to succeed since 20260811. Nothing in the
-- portal calls it yet, which is why nobody noticed; found while removing a test
-- pack on 2026-08-21.
--
-- THE FIX IS NOT TO WEAKEN THE TRIGGER. Append-only is the point: the events
-- table is what answers "was this change authorised, and by whom", and a log
-- that can be deleted by deleting its parent is not append-only in any sense
-- that matters. If anything the cascade was the bug — it meant an introducer
-- discarding a draft would erase the record that the draft ever existed.
--
-- So the events SURVIVE. `client_id` becomes NULL and the row keeps its
-- introducer_id, actor, action, detail and timestamp — which is the part with
-- evidentiary value. The column is already nullable, so nothing else changes.
--
-- Idempotent.

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT con.conname INTO fk_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
   WHERE rel.relname = 'introducer_events'
     AND con.contype = 'f'
     AND att.attname = 'client_id'
   LIMIT 1;

  IF fk_name IS NULL THEN
    RAISE NOTICE 'introducer_events has no client_id foreign key — nothing to change';
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE introducer_events DROP CONSTRAINT %I', fk_name);
  ALTER TABLE introducer_events
    ADD CONSTRAINT introducer_events_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES introducer_clients(id) ON DELETE SET NULL;

  RAISE NOTICE 'introducer_events.client_id now SET NULL on delete (was %)', fk_name;
END $$;

COMMENT ON COLUMN introducer_events.client_id IS
  'The referral this event belongs to, or NULL if that referral has since been deleted. '
  'SET NULL rather than CASCADE: the log is append-only, so deleting a referral must not '
  'erase the record that it existed.';
