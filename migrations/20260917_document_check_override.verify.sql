-- Verification for 20260917_document_check_override.sql.
--
-- Run AFTER the migration. Rolls itself back, so it is safe to run twice; it is
-- not safe against production because it writes rows before undoing them.
--
-- Every check states the invariant it defends. "Check 3 failed" tells the next
-- person nothing.

BEGIN;

DO $$
DECLARE
  rid uuid;
  did uuid;
  n   integer;
BEGIN
  -- 1. Both columns exist on client_documents, and the stamp is a timestamp.
  --    A boolean "overridden" would lose WHEN, and the whole point of an
  --    override is that someone can later ask who waved a document through.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'client_documents'
     AND ((column_name = 'check_override_by' AND data_type = 'text')
       OR (column_name = 'check_override_at' AND data_type LIKE 'timestamp%'));
  IF n <> 2 THEN RAISE EXCEPTION '1 FAIL override columns missing or wrong type (found %)', n; END IF;
  RAISE NOTICE '1 OK  a dismissal records both who and when';

  -- 2. Nullable: every document uploaded before today has no override, and a
  --    NOT NULL would have made this migration unrunnable.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'client_documents'
     AND column_name IN ('check_override_by','check_override_at')
     AND is_nullable = 'NO';
  IF n <> 0 THEN RAISE EXCEPTION '2 FAIL an override column is NOT NULL'; END IF;
  RAISE NOTICE '2 OK  no override is the default state';

  -- 3. A document can carry a dismissal.
  INSERT INTO document_requests (applicant_name, token_hash, expires_at)
  VALUES ('Verify Override', 'verify-override-' || gen_random_uuid(), now() + interval '30 days')
  RETURNING id INTO rid;
  INSERT INTO client_documents (request_id, doc_type, filename, storage_path, status)
  VALUES (rid, 'ato_income', 'ATO Income Statement 1 - Verify.pdf', 'portal/verify/1.pdf', 'accepted')
  RETURNING id INTO did;
  UPDATE client_documents
     SET check_override_by = 'rep@example.invalid', check_override_at = now()
   WHERE id = did;
  SELECT count(*) INTO n FROM client_documents
   WHERE id = did AND check_override_at IS NOT NULL AND check_override_by = 'rep@example.invalid';
  IF n <> 1 THEN RAISE EXCEPTION '3 FAIL a dismissal did not persist'; END IF;
  RAISE NOTICE '3 OK  a rep can dismiss the check on one file';

  -- 4. THE POINT: the dismissal belongs to the BYTES, not the slot. A
  --    replacement upload is a new row, so it arrives unjudged — otherwise
  --    dismissing a bad licence photo would wave through every later one,
  --    since the filename for a slot is deterministic and identical.
  INSERT INTO client_documents (request_id, doc_type, filename, storage_path, status)
  VALUES (rid, 'ato_income', 'ATO Income Statement 1 - Verify.pdf', 'portal/verify/2.pdf', 'accepted');
  SELECT count(*) INTO n FROM client_documents
   WHERE request_id = rid AND check_override_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION '4 FAIL a replacement inherited the old dismissal'; END IF;
  RAISE NOTICE '4 OK  a re-upload of the same slot starts unjudged';

  -- 5. The index verification relies on exists, so reading a request's
  --    dismissals stays a single indexed lookup rather than a table scan.
  SELECT count(*) INTO n FROM pg_indexes
   WHERE tablename = 'client_documents' AND indexname = 'client_documents_override_idx';
  IF n <> 1 THEN RAISE EXCEPTION '5 FAIL client_documents_override_idx missing'; END IF;
  RAISE NOTICE '5 OK  overrides are read by index';

  DELETE FROM client_documents WHERE request_id = rid;
  DELETE FROM document_requests WHERE id = rid;
  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;

ROLLBACK;
