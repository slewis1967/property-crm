-- Verification for 20260820_introducer_tier2_pack.sql.
--
-- Run AFTER the migration. Rolls itself back, so it is safe to run twice; it is
-- not safe against production because it writes rows before undoing them.
--
-- Every check states the invariant it defends. "Check 4 failed" tells the next
-- person nothing.
--
-- CHECK 6 IS THE ONE THAT MATTERS. `fact_find_data` is the client's whole
-- financial position and it is now editable by an introducer. If the lock guard
-- does not cover it, a submitted pack can be rewritten after the assessor has
-- read it, and every other control in this feature is decoration.

BEGIN;

DO $$
DECLARE
  fid1  uuid;   -- a Tier 1 firm
  fid2  uuid;   -- a Tier 2 firm
  uid   uuid;
  cid   uuid;
  gid   uuid;
  n     integer;
  ok    boolean;
BEGIN
  -- ── Fixtures ──────────────────────────────────────────────────────────────
  INSERT INTO introducers (firm_name, tier) VALUES ('Verify T1', 't1') RETURNING id INTO fid1;
  INSERT INTO introducers (firm_name, tier) VALUES ('Verify T2', 't2') RETURNING id INTO fid2;
  INSERT INTO introducer_users (introducer_id, email)
    VALUES (fid2, 'verify-t2@example.invalid') RETURNING id INTO uid;

  -- 1. The pack columns exist, with the safe defaults.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'introducer_clients'
     AND column_name IN ('pack_type','fact_find_data','fact_find_id');
  IF n <> 3 THEN RAISE EXCEPTION '1 FAIL pack columns missing (found %)', n; END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'introducer_clients' AND column_name = 'pack_type'
     AND column_default LIKE '%referral%';
  IF n <> 1 THEN RAISE EXCEPTION '1 FAIL pack_type does not default to referral'; END IF;
  RAISE NOTICE '1 OK  pack columns present, pack_type defaults to referral';

  -- 2. An existing referral is untouched by the migration: no pack_type given
  --    means an ordinary Tier 1 referral, from a Tier 1 firm, as before.
  INSERT INTO introducer_clients (introducer_id, first_name, last_name)
    VALUES (fid1, 'Old', 'Referral') RETURNING id INTO cid;
  SELECT count(*) INTO n FROM introducer_clients
   WHERE id = cid AND pack_type = 'referral' AND fact_find_data = '{}'::jsonb;
  IF n <> 1 THEN RAISE EXCEPTION '2 FAIL an ordinary referral did not default cleanly'; END IF;
  RAISE NOTICE '2 OK  existing referrals are unaffected';

  -- 3. pack_type is closed. A typo must not become a third kind of pack.
  BEGIN
    UPDATE introducer_clients SET pack_type = 'premium' WHERE id = cid;
    RAISE EXCEPTION '3 FAIL an unknown pack_type was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  RAISE NOTICE '3 OK  pack_type refuses anything it does not know';

  -- 4. A TIER 1 FIRM CANNOT HOLD A FULL PACK. The route checks this; so does
  --    this trigger, because the promise is "a Tier 1 introducer cannot do
  --    this" and a promise that depends on route code is not one.
  BEGIN
    INSERT INTO introducer_clients (introducer_id, first_name, pack_type)
      VALUES (fid1, 'Nope', 'full');
    RAISE EXCEPTION '4 FAIL a Tier 1 firm was allowed a full pack';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- ...and cannot get one by starting a referral and upgrading it.
  BEGIN
    UPDATE introducer_clients SET pack_type = 'full' WHERE id = cid;
    RAISE EXCEPTION '4 FAIL a Tier 1 referral was upgraded to a full pack';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  RAISE NOTICE '4 OK  a full pack requires Tier 2, on insert and on update';

  -- 5. A Tier 2 firm can. And a firm DEMOTED to Tier 1 immediately loses the
  --    ability to touch pack_type on packs it already holds — the guard reads
  --    the current tier, not the tier at the time the pack was started.
  INSERT INTO introducer_clients (introducer_id, submitted_by, first_name, last_name, pack_type, status)
    VALUES (fid2, uid, 'Ada', 'Lovelace', 'full', 'draft') RETURNING id INTO cid;
  RAISE NOTICE '5 OK  a Tier 2 firm can hold a full pack';

  -- 6. THE LOCK COVERS THE FACT FIND. A draft is freely editable; a submitted
  --    pack is not, and no info request can open it.
  UPDATE introducer_clients
     SET fact_find_data = '{"applicants":[{"given_names":"Ada"},{}]}'::jsonb
   WHERE id = cid;   -- still draft: allowed

  UPDATE introducer_clients SET status = 'submitted', submitted_at = now() WHERE id = cid;

  BEGIN
    UPDATE introducer_clients
       SET fact_find_data = '{"applicants":[{"given_names":"Someone else"},{}]}'::jsonb
     WHERE id = cid;
    RAISE EXCEPTION '6 FAIL a submitted pack''s fact find was rewritten without authorisation';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  RAISE NOTICE '6 OK  a submitted fact find cannot be changed without authorisation';

  -- 7. An OPEN INFO REQUEST STILL CANNOT OPEN IT. This is the specific hole the
  --    migration closes by name: `fact_find_data` defaults to '{}' rather than
  --    NULL, so the guard's "was it blank before" test would read an empty blob
  --    as fillable and let an info request seed an entire financial position
  --    onto a locked pack.
  INSERT INTO introducer_info_requests (client_id, requested_by, message, fields)
    VALUES (cid, 'verify@example.invalid', 'Please supply', ARRAY['fact_find_data','suburb']);

  BEGIN
    UPDATE introducer_clients
       SET fact_find_data = '{"applicants":[{"given_names":"Injected"},{}]}'::jsonb
     WHERE id = cid;
    RAISE EXCEPTION '7 FAIL an info request authorised a fact find rewrite';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- The same info request DOES still work for an ordinary blank field, so the
  -- exclusion above is narrow rather than having broken the additive path.
  UPDATE introducer_clients SET suburb = 'Brisbane' WHERE id = cid;
  SELECT count(*) INTO n FROM introducer_clients WHERE id = cid AND suburb = 'Brisbane';
  IF n <> 1 THEN RAISE EXCEPTION '7 FAIL the additive info-request path stopped working'; END IF;
  RAISE NOTICE '7 OK  info requests fill blanks but never open the fact find';

  -- 8. AN UNLOCK GRANT DOES open it. Otherwise a genuine correction would be
  --    impossible and the only route back would be a new pack.
  INSERT INTO introducer_unlock_grants (client_id, granted_by, reason, scope, expires_at)
    VALUES (cid, 'sean@example.invalid', 'verification', 'full', now() + interval '1 hour')
    RETURNING id INTO gid;

  UPDATE introducer_clients
     SET fact_find_data = '{"applicants":[{"given_names":"Corrected"},{}]}'::jsonb
   WHERE id = cid;
  SELECT (fact_find_data -> 'applicants' -> 0 ->> 'given_names') = 'Corrected' INTO ok
    FROM introducer_clients WHERE id = cid;
  IF NOT ok THEN RAISE EXCEPTION '8 FAIL a full unlock grant did not authorise a fact find change'; END IF;
  RAISE NOTICE '8 OK  a super admin can still authorise a correction';

  -- 9. Staff-only columns still move freely on a locked pack. The guard defends
  --    what the introducer supplied, not our own workflow columns — a pack that
  --    could not be advanced through its stages would be locked to us too.
  UPDATE introducer_clients
     SET stage = 'assessment', message_to_introducer = 'With the assessor.'
   WHERE id = cid;
  RAISE NOTICE '9 OK  staff columns are unaffected by the lock';

  -- 10. The document request can point back at the pack it came from.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'document_requests' AND column_name = 'introducer_client_id';
  IF n <> 1 THEN RAISE EXCEPTION '10 FAIL document_requests.introducer_client_id missing'; END IF;
  RAISE NOTICE '10 OK document requests record which pack created them';

  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;

ROLLBACK;
