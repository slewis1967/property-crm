-- Verification for 20260819_introducer_accreditation_expiry.sql.
--
-- Run AFTER the migration. Rolls itself back, so it is safe to run twice; it is
-- not safe against production because it writes rows before undoing them.
--
-- Every check states the invariant it defends. "Check 4 failed" tells the next
-- person nothing.

BEGIN;

DO $$
DECLARE
  fid uuid;
  aid uuid;
  d   date;
  n   integer;
BEGIN
  -- 1. The columns exist, on both tables, as DATE. A timestamptz here would
  --    give a calendar expiry a timezone and lapse it at the wrong hour.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'introducer_applications'
     AND column_name IN ('accreditation_expires_at','smsf_competency_expires_at')
     AND data_type = 'date';
  IF n <> 2 THEN RAISE EXCEPTION '1 FAIL application expiry columns missing or not DATE (found %)', n; END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'introducers'
     AND column_name IN ('accreditation_expires_at','smsf_competency_expires_at')
     AND data_type = 'date';
  IF n <> 2 THEN RAISE EXCEPTION '1 FAIL firm expiry columns missing or not DATE (found %)', n; END IF;
  RAISE NOTICE '1 OK  both tables carry two DATE expiry columns';

  -- 2. And they are NULLABLE. Every introducer accredited before today has no
  --    date; a NOT NULL here would have made this migration unrunnable.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name IN ('introducers','introducer_applications')
     AND column_name IN ('accreditation_expires_at','smsf_competency_expires_at')
     AND is_nullable = 'NO';
  IF n <> 0 THEN RAISE EXCEPTION '2 FAIL an expiry column is NOT NULL'; END IF;
  RAISE NOTICE '2 OK  expiries are nullable -- unrecorded is not expired';

  -- 3. An existing firm keeps NULL expiries. Nobody is locked out by deploying.
  INSERT INTO introducers (firm_name) VALUES ('Verify Firm') RETURNING id INTO fid;
  SELECT count(*) INTO n FROM introducers
   WHERE id = fid AND accreditation_expires_at IS NULL AND smsf_competency_expires_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION '3 FAIL a new firm did not default to unrecorded expiries'; END IF;
  RAISE NOTICE '3 OK  a firm created without expiries has none';

  -- 4. The dates round-trip as calendar days.
  UPDATE introducers
     SET accreditation_no = 'SBI-2026-9999',
         accreditation_expires_at = DATE '2027-08-14',
         smsf_competency_expires_at = DATE '2027-02-14'
   WHERE id = fid;
  SELECT accreditation_expires_at INTO d FROM introducers WHERE id = fid;
  IF d <> DATE '2027-08-14' THEN RAISE EXCEPTION '4 FAIL expiry did not round-trip (got %)', d; END IF;
  RAISE NOTICE '4 OK  expiry stores and reads as the same calendar day';

  -- 5. The application carries them too, so a reissued certificate can be
  --    derived from the first issue rather than from today.
  INSERT INTO introducer_applications (legal_name, email)
  VALUES ('Verify Person', 'verify-expiry@example.invalid')
  RETURNING id INTO aid;
  UPDATE introducer_applications
     SET certificate_issued_at = now(),
         accreditation_expires_at = DATE '2027-08-14',
         smsf_competency_expires_at = DATE '2027-02-14'
   WHERE id = aid;
  SELECT count(*) INTO n FROM introducer_applications
   WHERE id = aid AND accreditation_expires_at = DATE '2027-08-14';
  IF n <> 1 THEN RAISE EXCEPTION '5 FAIL application expiry did not persist'; END IF;
  RAISE NOTICE '5 OK  the application carries its own derived expiries';

  -- 6. The index the expiry panel reads through exists.
  SELECT count(*) INTO n FROM pg_indexes
   WHERE tablename = 'introducers' AND indexname = 'introducers_accreditation_expiry_idx';
  IF n <> 1 THEN RAISE EXCEPTION '6 FAIL the expiry index is missing'; END IF;
  RAISE NOTICE '6 OK  expiry index present';

  -- 7. The firm records its tier, and defaults DOWN rather than up.
  SELECT count(*) INTO n FROM introducers WHERE id = fid AND tier = 't1';
  IF n <> 1 THEN RAISE EXCEPTION '7 FAIL a new firm did not default to tier t1'; END IF;

  BEGIN
    UPDATE introducers SET tier = 't3' WHERE id = fid;
    RAISE EXCEPTION '7 FAIL an unknown tier was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  RAISE NOTICE '7 OK  firm tier defaults to t1 and refuses anything unknown';

  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;

ROLLBACK;
