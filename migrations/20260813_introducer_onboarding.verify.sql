-- Verification for migrations/20260813_introducer_onboarding.sql.
-- Creates a throwaway application, exercises every guard from both directions,
-- then deletes everything it made. Read the `outcome` column: every row must
-- say PASS. Re-run after ANY change to the guard trigger.
--
-- Why this exists: the guards are plpgsql. Unit tests cannot reach them, and the
-- last introducer migration shipped a plpgsql bug (`text[] || 'literal'`) that
-- looked like a working lock while actually rejecting authorised writes too.
-- Only running the SQL finds that class of fault.

CREATE TEMP TABLE IF NOT EXISTS onboard_test(step text, outcome text, detail text);
TRUNCATE onboard_test;

DO $$
DECLARE
  aid uuid;
  fid uuid;
  did uuid;
  n   int;
  paths text[];
BEGIN
  -- ---- structure ----------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename IN ('introducer_applications','introducer_identity_documents')
     AND rowsecurity = false;
  INSERT INTO onboard_test VALUES (
    '0. RLS enabled on both new tables',
    CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END,
    n || ' table(s) without RLS');

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('introducer_applications','introducer_identity_documents');
  INSERT INTO onboard_test VALUES (
    '1. No RLS policies (service-role only)',
    CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END,
    n || ' policy/policies found');

  SELECT count(*) INTO n FROM storage.buckets
   WHERE id = 'introducer-identity' AND public = false;
  INSERT INTO onboard_test VALUES (
    '2. Identity bucket exists and is private',
    CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END, '');

  -- ---- seed ----------------------------------------------------------------
  INSERT INTO introducer_applications (legal_name, email, firm_name, token_hash, token_expires_at, created_by)
  VALUES ('Verify Candidate', 'verify+onboard@example.invalid', 'Verify Pty Ltd',
          'hash-' || gen_random_uuid(), now() + interval '30 days', 'verify-script')
  RETURNING id INTO aid;

  INSERT INTO onboard_test VALUES (
    '3. Application starts in state=invited with no introducer_id',
    CASE WHEN (SELECT state = 'invited' AND introducer_id IS NULL
                 FROM introducer_applications WHERE id = aid)
         THEN 'PASS' ELSE 'FAIL' END, '');

  -- ---- tier is closed ------------------------------------------------------
  BEGIN
    UPDATE introducer_applications SET tier = 't2' WHERE id = aid;
    INSERT INTO onboard_test VALUES ('4. Tier 2 is refused', 'FAIL', 'the CHECK allowed t2');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO onboard_test VALUES ('4. Tier 2 is refused', 'PASS', '');
  END;

  -- ---- state vocabulary is closed -----------------------------------------
  BEGIN
    UPDATE introducer_applications SET state = 'definitely_not_a_state' WHERE id = aid;
    INSERT INTO onboard_test VALUES ('5. Unknown state refused', 'FAIL', 'the CHECK allowed it');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO onboard_test VALUES ('5. Unknown state refused', 'PASS', '');
  END;

  -- ---- the pipeline must still MOVE ---------------------------------------
  -- The failure mode that matters: a guard so eager it blocks legitimate
  -- progress. Walk the whole runway and assert every step is allowed.
  BEGIN
    UPDATE introducer_applications SET state = 'nda_signed'         WHERE id = aid;
    UPDATE introducer_applications SET state = 'id_uploaded'        WHERE id = aid;
    UPDATE introducer_applications SET state = 'id_verified',
           id_check_provider = 'stub', id_check_result = 'pass', id_checked_at = now() WHERE id = aid;
    UPDATE introducer_applications SET state = 'course_started'     WHERE id = aid;
    UPDATE introducer_applications SET state = 'exam_passed',
           exam_score = 35, exam_total = 35, exam_passed_at = now() WHERE id = aid;
    UPDATE introducer_applications SET state = 'certificate_issued',
           accreditation_no = 'SBI-TEST-' || nextval('introducer_accreditation_seq') WHERE id = aid;
    UPDATE introducer_applications SET state = 'agreement_sent'     WHERE id = aid;
    UPDATE introducer_applications SET state = 'agreement_signed'   WHERE id = aid;
    INSERT INTO onboard_test VALUES ('6. Every forward transition is allowed', 'PASS', '');
  EXCEPTION WHEN others THEN
    INSERT INTO onboard_test VALUES ('6. Every forward transition is allowed', 'FAIL', SQLERRM);
  END;

  -- ---- updated_at is maintained -------------------------------------------
  -- NOT `updated_at > created_at`: now() is the TRANSACTION timestamp, so both
  -- columns are identical inside this DO block however well the trigger works.
  -- Instead, plant a stale value and prove the trigger overwrites it.
  UPDATE introducer_applications SET updated_at = timestamptz '2000-01-01' WHERE id = aid;
  SELECT count(*) INTO n FROM introducer_applications
   WHERE id = aid AND updated_at > timestamptz '2020-01-01';
  INSERT INTO onboard_test VALUES (
    '7. Trigger stamps updated_at, ignoring what the caller supplied',
    CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END, '');

  -- ---- accreditation number is permanent ----------------------------------
  BEGIN
    UPDATE introducer_applications SET accreditation_no = 'SBI-TAMPERED' WHERE id = aid;
    INSERT INTO onboard_test VALUES ('8. Accreditation number cannot be changed', 'FAIL', 'the update succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO onboard_test VALUES ('8. Accreditation number cannot be changed', 'PASS', '');
  END;

  -- ---- activation ----------------------------------------------------------
  INSERT INTO introducers (firm_name, contact_email, created_by)
  VALUES ('Verify Pty Ltd', 'verify+onboard@example.invalid', 'verify-script')
  RETURNING id INTO fid;

  BEGIN
    UPDATE introducer_applications
       SET introducer_id = fid, state = 'activated', activated_at = now()
     WHERE id = aid;
    INSERT INTO onboard_test VALUES ('9. Activation is allowed once', 'PASS', '');
  EXCEPTION WHEN others THEN
    INSERT INTO onboard_test VALUES ('9. Activation is allowed once', 'FAIL', SQLERRM);
  END;

  BEGIN
    UPDATE introducer_applications SET introducer_id = NULL WHERE id = aid;
    INSERT INTO onboard_test VALUES ('10. Cannot detach from its firm', 'FAIL', 'the update succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO onboard_test VALUES ('10. Cannot detach from its firm', 'PASS', '');
  END;

  BEGIN
    UPDATE introducer_applications SET state = 'invited' WHERE id = aid;
    INSERT INTO onboard_test VALUES ('11. Activated cannot re-enter the pipeline', 'FAIL', 'the update succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO onboard_test VALUES ('11. Activated cannot re-enter the pipeline', 'PASS', '');
  END;

  -- Annotating an activated row must still work.
  BEGIN
    UPDATE introducer_applications SET notes = 'annotated after activation' WHERE id = aid;
    INSERT INTO onboard_test VALUES ('12. Activated row can still be annotated', 'PASS', '');
  EXCEPTION WHEN others THEN
    INSERT INTO onboard_test VALUES ('12. Activated row can still be annotated', 'FAIL', SQLERRM);
  END;

  -- ---- identity documents --------------------------------------------------
  INSERT INTO introducer_identity_documents (application_id, side, filename, storage_path)
  VALUES (aid, 'front', 'front.jpg', aid || '/front.jpg') RETURNING id INTO did;
  INSERT INTO introducer_identity_documents (application_id, side, filename, storage_path)
  VALUES (aid, 'back', 'back.jpg', aid || '/back.jpg');

  BEGIN
    INSERT INTO introducer_identity_documents (application_id, side, filename, storage_path)
    VALUES (aid, 'front', 'front2.jpg', aid || '/front2.jpg');
    INSERT INTO onboard_test VALUES ('13. Only one live document per side', 'FAIL', 'a second front was accepted');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO onboard_test VALUES ('13. Only one live document per side', 'PASS', '');
  END;

  BEGIN
    INSERT INTO introducer_identity_documents (application_id, side, filename, storage_path)
    VALUES (aid, 'sideways', 'x.jpg', aid || '/x.jpg');
    INSERT INTO onboard_test VALUES ('14. Invented document slot refused', 'FAIL', 'the CHECK allowed it');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO onboard_test VALUES ('14. Invented document slot refused', 'PASS', '');
  END;

  -- ---- purge returns paths so the caller can delete the objects ------------
  SELECT array_agg(p.purged_path) INTO paths
    FROM purge_introducer_identity_documents(fid) p;
  INSERT INTO onboard_test VALUES (
    '15. Purge marks both images and returns their paths',
    CASE WHEN coalesce(array_length(paths, 1), 0) = 2 THEN 'PASS' ELSE 'FAIL' END,
    coalesce(array_length(paths, 1), 0) || ' path(s) returned');

  SELECT count(*) INTO n FROM introducer_identity_documents
   WHERE application_id = aid AND purged_at IS NULL;
  INSERT INTO onboard_test VALUES (
    '16. No live images remain after purge',
    CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n || ' still live');

  -- The rows survive the purge, so the file remains auditable as having existed.
  SELECT count(*) INTO n FROM introducer_identity_documents WHERE application_id = aid;
  INSERT INTO onboard_test VALUES (
    '17. Purge keeps the record, destroys only the image',
    CASE WHEN n = 2 THEN 'PASS' ELSE 'FAIL' END, n || ' row(s) retained');

  -- After a purge the slot is free again, so a re-verified introducer can
  -- re-upload without tripping the uniqueness rule.
  BEGIN
    INSERT INTO introducer_identity_documents (application_id, side, filename, storage_path)
    VALUES (aid, 'front', 'front-new.jpg', aid || '/front-new.jpg');
    INSERT INTO onboard_test VALUES ('18. Slot reusable after purge', 'PASS', '');
  EXCEPTION WHEN others THEN
    INSERT INTO onboard_test VALUES ('18. Slot reusable after purge', 'FAIL', SQLERRM);
  END;

  -- ---- one live application per email --------------------------------------
  BEGIN
    INSERT INTO introducer_applications (legal_name, email, token_hash, token_expires_at)
    VALUES ('Duplicate', 'VERIFY+ONBOARD@example.invalid',
            'hash-' || gen_random_uuid(), now() + interval '30 days');
    INSERT INTO onboard_test VALUES ('19. Duplicate live email refused (case-insensitive)', 'FAIL', 'it was accepted');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO onboard_test VALUES ('19. Duplicate live email refused (case-insensitive)', 'PASS', '');
  END;

  -- A withdrawn application must not block re-invitation.
  UPDATE introducer_applications SET state = 'withdrawn', withdrawn_at = now()
   WHERE id = aid AND state <> 'activated';
  BEGIN
    INSERT INTO introducer_applications (legal_name, email, token_hash, token_expires_at)
    VALUES ('Second attempt', 'verify+onboard2@example.invalid',
            'hash-' || gen_random_uuid(), now() + interval '30 days');
    INSERT INTO onboard_test VALUES ('20. A fresh application can be created', 'PASS', '');
  EXCEPTION WHEN others THEN
    INSERT INTO onboard_test VALUES ('20. A fresh application can be created', 'FAIL', SQLERRM);
  END;

  -- ---- signature doc types -------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_constraint
   WHERE conname = 'signature_requests_doc_type_check'
     AND pg_get_constraintdef(oid) LIKE '%introducer_agreement%';
  INSERT INTO onboard_test VALUES (
    '21. signature_requests admits introducer documents',
    CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END, '');

  -- ---- clean up ------------------------------------------------------------
  DELETE FROM introducer_applications
   WHERE email IN ('verify+onboard@example.invalid','verify+onboard2@example.invalid');
  DELETE FROM introducers WHERE id = fid;

  SELECT count(*) INTO n FROM introducer_applications
   WHERE email LIKE 'verify+onboard%@example.invalid';
  INSERT INTO onboard_test VALUES (
    '22. Test data removed',
    CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n || ' row(s) left behind');
END $$;

SELECT step, outcome, detail FROM onboard_test ORDER BY
  (regexp_match(step, '^([0-9]+)'))[1]::int;
