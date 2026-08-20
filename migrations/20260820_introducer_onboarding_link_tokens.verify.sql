-- Verification for 20260820_introducer_onboarding_link_tokens.sql.
--
-- Run AFTER the migration. Rolls itself back, so it is safe to run twice; it is
-- not safe against production because it writes rows before undoing them.
--
-- Every check states the invariant it defends. "Check 4 failed" tells the next
-- person nothing.

BEGIN;

DO $$
DECLARE
  aid uuid;
  n   integer;
BEGIN
  -- 1. The table exists, and the hash is unique across every application — two
  --    candidates must never be reachable by the same link.
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_name = 'introducer_application_tokens';
  IF n <> 1 THEN RAISE EXCEPTION '1 FAIL introducer_application_tokens does not exist'; END IF;

  SELECT count(*) INTO n FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE t.relname = 'introducer_application_tokens' AND c.contype = 'u';
  IF n < 1 THEN RAISE EXCEPTION '1 FAIL token_hash is not unique'; END IF;
  RAISE NOTICE '1 OK  the table exists and one hash cannot serve two applicants';

  -- 2. Every live application was backfilled. This is the check that says the
  --    links already sitting in people's inboxes still resolve after deploy.
  SELECT count(*) INTO n
    FROM introducer_applications a
   WHERE NOT EXISTS (
     SELECT 1 FROM introducer_application_tokens t WHERE t.token_hash = a.token_hash
   );
  IF n <> 0 THEN RAISE EXCEPTION '2 FAIL % application(s) have no token row -- their live link would break', n; END IF;
  RAISE NOTICE '2 OK  every existing link was carried across';

  -- 3. THE WHOLE POINT: two links for one applicant, both live at once. Before
  --    this migration the second insert would have overwritten the first.
  INSERT INTO introducer_applications (legal_name, email, token_hash, token_expires_at)
  VALUES ('Verify Candidate', 'verify-tokens@example.invalid',
          'verify-hash-old', now() + interval '30 days')
  RETURNING id INTO aid;

  INSERT INTO introducer_application_tokens (application_id, token_hash, expires_at, purpose)
  VALUES (aid, 'verify-hash-old', now() + interval '30 days', 'certificate'),
         (aid, 'verify-hash-new', now() + interval '30 days', 'agreement');

  SELECT count(*) INTO n FROM introducer_application_tokens
   WHERE application_id = aid AND revoked_at IS NULL AND expires_at > now();
  IF n <> 2 THEN RAISE EXCEPTION '3 FAIL expected 2 live links, found %', n; END IF;
  RAISE NOTICE '3 OK  a second link does not kill the first';

  -- 4. Revocation is still available — it just has to be asked for now.
  UPDATE introducer_application_tokens
     SET revoked_at = now()
   WHERE application_id = aid AND purpose = 'certificate';
  SELECT count(*) INTO n FROM introducer_application_tokens
   WHERE application_id = aid AND revoked_at IS NULL AND expires_at > now();
  IF n <> 1 THEN RAISE EXCEPTION '4 FAIL revoking one link left % live', n; END IF;
  RAISE NOTICE '4 OK  a link can still be deliberately killed';

  -- 5. Tokens die with the application they belong to. An orphaned hash that
  --    still resolved would be a link into nothing.
  DELETE FROM introducer_applications WHERE id = aid;
  SELECT count(*) INTO n FROM introducer_application_tokens WHERE application_id = aid;
  IF n <> 0 THEN RAISE EXCEPTION '5 FAIL % token(s) outlived their application', n; END IF;
  RAISE NOTICE '5 OK  deleting an application takes its links with it';

  -- 6. RLS is on with no policies: service role only, exactly like the
  --    application table. The anon key must not be able to read a hash.
  SELECT count(*) INTO n FROM pg_class
   WHERE relname = 'introducer_application_tokens' AND relrowsecurity;
  IF n <> 1 THEN RAISE EXCEPTION '6 FAIL row level security is not enabled'; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE tablename = 'introducer_application_tokens';
  IF n <> 0 THEN RAISE EXCEPTION '6 FAIL % policy/policies would expose hashes beyond the service role', n; END IF;
  RAISE NOTICE '6 OK  hashes are reachable by the service role and nothing else';

  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;

ROLLBACK;
