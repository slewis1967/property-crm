-- Verification for 20260814_introducer_resources.sql.
--
-- Run AFTER the migration, against a scratch database. Rolls itself back, so it
-- is safe to run twice; it is not safe to run against production because it
-- writes rows before undoing them.
--
-- Every check states the invariant it is defending, because a failing assertion
-- whose message is "check 7 failed" tells the next person nothing.

BEGIN;

DO $$
DECLARE
  rid  uuid;
  fid  uuid;
  aid  uuid;
  n    integer;
  msg  text;
BEGIN
  -- 1. The shelf exists and takes a row.
  INSERT INTO introducer_resources (slug, title, storage_path, filename)
  VALUES ('verify-doc', 'Verify Doc', 'library/verify.pdf', 'verify.pdf')
  RETURNING id INTO rid;
  RAISE NOTICE '1 OK  resource row created';

  -- 2. A new resource is NOT published. This is the one that stops an
  --    unfinished compliance document reaching every introducer.
  SELECT count(*) INTO n FROM introducer_resources WHERE id = rid AND published;
  IF n <> 0 THEN RAISE EXCEPTION '2 FAIL a new resource defaulted to published'; END IF;
  RAISE NOTICE '2 OK  new resource is unpublished by default';

  -- 3. And requires no acknowledgement unless asked.
  SELECT count(*) INTO n FROM introducer_resources WHERE id = rid AND requires_ack;
  IF n <> 0 THEN RAISE EXCEPTION '3 FAIL a new resource defaulted to requires_ack'; END IF;
  RAISE NOTICE '3 OK  new resource requires no acknowledgement by default';

  -- 4. Slugs are unique -- this is what makes re-publishing an updated document
  --    an UPDATE rather than a second entry on the shelf.
  BEGIN
    INSERT INTO introducer_resources (slug, title, storage_path, filename)
    VALUES ('verify-doc', 'Duplicate', 'library/dupe.pdf', 'dupe.pdf');
    RAISE EXCEPTION '4 FAIL a duplicate slug was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '4 OK  duplicate slug rejected';
  END;

  -- 5. Category is constrained.
  BEGIN
    INSERT INTO introducer_resources (slug, title, storage_path, filename, category)
    VALUES ('verify-cat', 'Bad category', 'library/x.pdf', 'x.pdf', 'Marketing Stuff');
    RAISE EXCEPTION '5 FAIL an unknown category was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '5 OK  unknown category rejected';
  END;

  -- 6. updated_at moves on UPDATE. Planting a stale value first, because now()
  --    is the TRANSACTION timestamp -- inside one block, created_at and any
  --    freshly written updated_at are identical, so "greater than created_at"
  --    could never pass and would silently prove nothing.
  UPDATE introducer_resources SET updated_at = timestamptz '2000-01-01' WHERE id = rid;
  SELECT count(*) INTO n
    FROM introducer_resources WHERE id = rid AND updated_at = timestamptz '2000-01-01';
  IF n <> 0 THEN RAISE EXCEPTION '6 FAIL the trigger did not overwrite a stale updated_at'; END IF;
  RAISE NOTICE '6 OK  updated_at is trigger-maintained';

  -- 7. Acknowledgements record, keyed to a version.
  INSERT INTO introducers (firm_name) VALUES ('Verify Pty Ltd') RETURNING id INTO fid;
  INSERT INTO introducer_resource_acks (resource_id, introducer_id, version, acknowledged_by)
  VALUES (rid, fid, '1.0', 'verify@example.com')
  RETURNING id INTO aid;
  RAISE NOTICE '7 OK  acknowledgement recorded';

  -- 8. The same person cannot acknowledge the same version twice -- otherwise
  --    a double-clicked button reads as two separate confirmations.
  BEGIN
    INSERT INTO introducer_resource_acks (resource_id, introducer_id, version)
    VALUES (rid, fid, '1.0');
    RAISE EXCEPTION '8 FAIL a duplicate acknowledgement was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '8 OK  duplicate acknowledgement of the same version rejected';
  END;

  -- 9. But a NEW version is separately acknowledgeable. This is the invariant
  --    the whole table exists for: 1.0 signed off is not 1.1 signed off.
  INSERT INTO introducer_resource_acks (resource_id, introducer_id, version)
  VALUES (rid, fid, '1.1');
  SELECT count(*) INTO n FROM introducer_resource_acks
    WHERE resource_id = rid AND introducer_id = fid;
  IF n <> 2 THEN RAISE EXCEPTION '9 FAIL expected 2 acknowledgements across versions, got %', n; END IF;
  RAISE NOTICE '9 OK  a new version is acknowledged separately';

  -- 10. Acknowledgements cannot be edited.
  BEGIN
    UPDATE introducer_resource_acks SET acknowledged_by = 'someone else' WHERE id = aid;
    RAISE EXCEPTION '10 FAIL an acknowledgement was edited';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg LIKE '10 FAIL%' THEN RAISE; END IF;
    RAISE NOTICE '10 OK  acknowledgement UPDATE refused';
  END;

  -- 11. Nor deleted.
  BEGIN
    DELETE FROM introducer_resource_acks WHERE id = aid;
    RAISE EXCEPTION '11 FAIL an acknowledgement was deleted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg LIKE '11 FAIL%' THEN RAISE; END IF;
    RAISE NOTICE '11 OK  acknowledgement DELETE refused';
  END;

  -- 11b. Deleting the resource does not quietly take the evidence with it. The
  --      FK is RESTRICT precisely so this fails as a foreign-key violation
  --      rather than as a trigger exception raised from a cascade the caller
  --      never asked for. Retiring a document means unpublishing it.
  BEGIN
    DELETE FROM introducer_resources WHERE id = rid;
    RAISE EXCEPTION '11b FAIL an acknowledged resource was deleted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE '11b OK  deleting an acknowledged resource refused';
  END;

  -- 12. RLS is on for both, so the anon key reaches neither.
  SELECT count(*) INTO n FROM pg_class
   WHERE relname IN ('introducer_resources','introducer_resource_acks') AND relrowsecurity;
  IF n <> 2 THEN RAISE EXCEPTION '12 FAIL RLS is not enabled on both tables (found %)', n; END IF;
  RAISE NOTICE '12 OK  RLS enabled on both tables';

  -- 13. The bucket exists and is private. A public library bucket would make
  --     every document a permanent unauthenticated URL.
  SELECT count(*) INTO n FROM storage.buckets WHERE id = 'introducer-library' AND public = false;
  IF n <> 1 THEN RAISE EXCEPTION '13 FAIL introducer-library is missing or public'; END IF;
  RAISE NOTICE '13 OK  introducer-library bucket exists and is private';

  RAISE NOTICE '--- all checks passed ---';
END $$;

ROLLBACK;
