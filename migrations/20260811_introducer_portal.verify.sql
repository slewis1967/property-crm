-- Verification for migrations/20260811_introducer_portal.sql.
-- Creates a throwaway firm + referral, exercises the lock from every angle, then
-- deletes everything it made. Read the `outcome` column: every row must say PASS.

CREATE TEMP TABLE IF NOT EXISTS lock_test(step text, outcome text, detail text);
TRUNCATE lock_test;

DO $$
DECLARE
  fid uuid;
  cid uuid;
  eid uuid;
  gid uuid;
  rid uuid;
  n int;
BEGIN
  -- ---- RLS ---------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename LIKE 'introducer%'
     AND rowsecurity = false;
  INSERT INTO lock_test VALUES (
    '0. RLS enabled on every introducer table',
    CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END,
    n || ' table(s) without RLS');

  -- ---- fixtures ----------------------------------------------------------
  INSERT INTO introducers (firm_name, contact_email, status)
       VALUES ('__LOCK_TEST__ delete me', 'locktest@example.invalid', 'active')
    RETURNING id INTO fid;

  INSERT INTO introducer_clients
              (introducer_id, first_name, last_name, email, phone, status, submitted_at)
       VALUES (fid, 'Test', 'Referral', 'locktest@example.invalid', '0400000000', 'submitted', now())
    RETURNING id INTO cid;

  -- ---- 1. a submitted referral is locked ---------------------------------
  BEGIN
    UPDATE introducer_clients SET phone = '0411111111' WHERE id = cid;
    INSERT INTO lock_test VALUES ('1. locked referral rejects an edit', 'FAIL', 'the update was allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO lock_test VALUES ('1. locked referral rejects an edit', 'PASS', SQLERRM);
  END;

  -- ---- 2. staff-only columns are never blocked ---------------------------
  BEGIN
    UPDATE introducer_clients SET stage = 'under_review', message_to_introducer = 'hello' WHERE id = cid;
    INSERT INTO lock_test VALUES ('2. staff columns still writable while locked', 'PASS', '');
  EXCEPTION WHEN others THEN
    INSERT INTO lock_test VALUES ('2. staff columns still writable while locked', 'FAIL', SQLERRM);
  END;

  -- ---- 3. an active grant authorises the named field ---------------------
  INSERT INTO introducer_unlock_grants (client_id, granted_by, reason, scope, fields, expires_at)
       VALUES (cid, 'test@nextkey.com.au', 'lock test', 'fields', ARRAY['phone'], now() + interval '1 hour')
    RETURNING id INTO gid;

  BEGIN
    UPDATE introducer_clients SET phone = '0411111111' WHERE id = cid;
    INSERT INTO lock_test VALUES ('3. granted field is editable', 'PASS', '');
  EXCEPTION WHEN others THEN
    INSERT INTO lock_test VALUES ('3. granted field is editable', 'FAIL', SQLERRM);
  END;

  -- ---- 4. the grant does NOT cover other fields --------------------------
  BEGIN
    UPDATE introducer_clients SET last_name = 'Changed' WHERE id = cid;
    INSERT INTO lock_test VALUES ('4. grant does not spill to other fields', 'FAIL', 'the update was allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO lock_test VALUES ('4. grant does not spill to other fields', 'PASS', SQLERRM);
  END;

  UPDATE introducer_unlock_grants SET consumed_at = now() WHERE id = gid;

  -- ---- 5. an info request lets a BLANK field be filled -------------------
  INSERT INTO introducer_info_requests (client_id, requested_by, message, fields)
       VALUES (cid, 'test@nextkey.com.au', 'need the suburb', ARRAY['suburb'])
    RETURNING id INTO rid;

  BEGIN
    UPDATE introducer_clients SET suburb = 'Ashgrove' WHERE id = cid;
    INSERT INTO lock_test VALUES ('5. info request fills a blank field', 'PASS', '');
  EXCEPTION WHEN others THEN
    INSERT INTO lock_test VALUES ('5. info request fills a blank field', 'FAIL', SQLERRM);
  END;

  -- ---- 6. ...but never overwrites an answered one ------------------------
  BEGIN
    UPDATE introducer_clients SET suburb = 'Toowong' WHERE id = cid;
    INSERT INTO lock_test VALUES ('6. info request cannot overwrite', 'FAIL', 'the update was allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO lock_test VALUES ('6. info request cannot overwrite', 'PASS', SQLERRM);
  END;

  -- ---- 7. an expired grant authorises nothing ----------------------------
  INSERT INTO introducer_unlock_grants (client_id, granted_by, reason, scope, fields, expires_at)
       VALUES (cid, 'test@nextkey.com.au', 'expired', 'full', ARRAY[]::text[], now() - interval '1 minute');
  BEGIN
    UPDATE introducer_clients SET last_name = 'Changed' WHERE id = cid;
    INSERT INTO lock_test VALUES ('7. expired grant authorises nothing', 'FAIL', 'the update was allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO lock_test VALUES ('7. expired grant authorises nothing', 'PASS', SQLERRM);
  END;

  -- ---- 8. the audit trail is append-only ---------------------------------
  INSERT INTO introducer_events (client_id, introducer_id, actor_type, actor, action)
       VALUES (cid, fid, 'system', 'lock-test', 'submitted')
    RETURNING id INTO eid;
  BEGIN
    UPDATE introducer_events SET action = 'tampered' WHERE id = eid;
    INSERT INTO lock_test VALUES ('8. audit trail rejects UPDATE', 'FAIL', 'the update was allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO lock_test VALUES ('8. audit trail rejects UPDATE', 'PASS', SQLERRM);
  END;
  BEGIN
    DELETE FROM introducer_events WHERE id = eid;
    INSERT INTO lock_test VALUES ('9. audit trail rejects DELETE', 'FAIL', 'the delete was allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO lock_test VALUES ('9. audit trail rejects DELETE', 'PASS', SQLERRM);
  END;

  -- ---- 10. a draft is freely editable ------------------------------------
  UPDATE introducer_clients SET status = 'draft' WHERE id = cid;
  BEGIN
    UPDATE introducer_clients SET last_name = 'Draftable', phone = '0422222222' WHERE id = cid;
    INSERT INTO lock_test VALUES ('10. a draft is freely editable', 'PASS', '');
  EXCEPTION WHEN others THEN
    INSERT INTO lock_test VALUES ('10. a draft is freely editable', 'FAIL', SQLERRM);
  END;

  -- ---- 11. the client_ref sequence assigns a reference --------------------
  SELECT count(*) INTO n FROM introducer_clients WHERE id = cid AND client_ref LIKE 'NKI-%';
  INSERT INTO lock_test VALUES (
    '11. client_ref auto-assigned',
    CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END,
    (SELECT coalesce(client_ref, '(null)') FROM introducer_clients WHERE id = cid));

  -- ---- cleanup: leave the database exactly as we found it -----------------
  DELETE FROM introducer_unlock_grants WHERE client_id = cid;
  DELETE FROM introducer_info_requests WHERE client_id = cid;
  ALTER TABLE introducer_events DISABLE TRIGGER introducer_events_no_update;
  DELETE FROM introducer_events WHERE client_id = cid OR introducer_id = fid;
  ALTER TABLE introducer_events ENABLE TRIGGER introducer_events_no_update;
  DELETE FROM introducer_clients WHERE id = cid;
  DELETE FROM introducers WHERE id = fid;

  SELECT count(*) INTO n FROM introducers WHERE firm_name = '__LOCK_TEST__ delete me';
  INSERT INTO lock_test VALUES (
    '12. test data cleaned up',
    CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END,
    n || ' leftover row(s)');
END $$;

SELECT step, outcome, left(detail, 90) AS detail FROM lock_test ORDER BY step;
