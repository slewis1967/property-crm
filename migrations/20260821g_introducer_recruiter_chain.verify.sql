-- Verification for 20260821g_introducer_recruiter_chain.sql.
--
-- Run AFTER the migration. Rolls itself back, so it is safe to run twice; it is
-- not safe against production because it writes rows before undoing them.
--
-- Every check states the invariant it defends. "Check 4 failed" tells the next
-- person nothing.

BEGIN;

DO $$
DECLARE
  bdm uuid;
  sub uuid;
  aid uuid;
  n   integer;
BEGIN
  -- 1. Both columns exist on both tables. The application carries them because
  --    the schedule is signed while the candidate is still an application.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name IN ('introducers','introducer_applications')
     AND column_name IN ('recruited_by_introducer_id','recruits_introducers');
  IF n <> 4 THEN RAISE EXCEPTION '1 FAIL expected 4 recruiter columns across both tables, found %', n; END IF;
  RAISE NOTICE '1 OK  both the panel and the runway carry the recruiter chain';

  -- 2. The entitlement defaults to FALSE everywhere. Recording who recruited
  --    whom must never, by itself, create a payment obligation.
  INSERT INTO introducers (firm_name) VALUES ('Verify BDM') RETURNING id INTO bdm;
  SELECT count(*) INTO n FROM introducers
   WHERE id = bdm AND recruits_introducers = false AND recruited_by_introducer_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION '2 FAIL a new introducer did not default to no network entitlement'; END IF;
  RAISE NOTICE '2 OK  nobody earns on a network until somebody says so';

  -- 3. A recruit points at its recruiter.
  INSERT INTO introducers (firm_name, recruited_by_introducer_id)
  VALUES ('Verify Recruit', bdm) RETURNING id INTO sub;
  SELECT count(*) INTO n FROM introducers WHERE id = sub AND recruited_by_introducer_id = bdm;
  IF n <> 1 THEN RAISE EXCEPTION '3 FAIL the recruit did not record its recruiter'; END IF;
  RAISE NOTICE '3 OK  a recruit records who brought them in';

  -- 4. Nobody recruits themselves, which would be an easy way to double-count a
  --    settlement against one person.
  BEGIN
    UPDATE introducers SET recruited_by_introducer_id = bdm WHERE id = bdm;
    RAISE EXCEPTION '4 FAIL an introducer was allowed to recruit itself';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '4 OK  an introducer cannot be its own recruiter';
  END;

  -- 5. THE ONE THAT MATTERS: a network entitlement cannot exist on the standard
  --    arrangement, under which Springboard pays nothing at all. Granting one
  --    there would contradict the agreement the person signed.
  INSERT INTO introducer_applications
    (legal_name, email, token_hash, token_expires_at, agreement_variant)
  VALUES ('Verify Standard', 'verify-recruit@example.invalid', 'verify-recruit-hash',
          now() + interval '30 days', 'standard')
  RETURNING id INTO aid;

  BEGIN
    UPDATE introducer_applications SET recruits_introducers = true WHERE id = aid;
    RAISE EXCEPTION '5 FAIL a standard arrangement was granted a network fee';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '5 OK  only a paid arrangement can earn on a network';
  END;

  -- 6. And on the paid arrangement it is allowed.
  UPDATE introducer_applications
     SET agreement_variant = 'paid', recruits_introducers = true
   WHERE id = aid;
  SELECT count(*) INTO n FROM introducer_applications WHERE id = aid AND recruits_introducers;
  IF n <> 1 THEN RAISE EXCEPTION '6 FAIL a paid arrangement could not be granted a network fee'; END IF;
  RAISE NOTICE '6 OK  a paid arrangement can be granted one';

  DELETE FROM introducer_applications WHERE id = aid;
  DELETE FROM introducers WHERE id IN (sub, bdm);
  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;

ROLLBACK;
