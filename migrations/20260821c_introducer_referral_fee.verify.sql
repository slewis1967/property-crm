-- Verification for 20260821c_introducer_referral_fee.sql.
--
-- Run AFTER the migration. Rolls itself back, so it is safe to run twice; it is
-- not safe against production because it writes rows before undoing them.
--
-- Every check states the invariant it defends. "Check 3 failed" tells the next
-- person nothing.

BEGIN;

DO $$
DECLARE
  aid uuid;
  n   integer;
BEGIN
  -- 1. Both columns exist, and both are TEXT. A numeric fee column would force
  --    "0.25% of purchase price" to be entered as a lie.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'introducer_applications'
     AND column_name IN ('fee_per_settlement','fee_notes')
     AND data_type = 'text';
  IF n <> 2 THEN RAISE EXCEPTION '1 FAIL fee columns missing or not text (found %)', n; END IF;
  RAISE NOTICE '1 OK  the fee is recorded as text, not as arithmetic';

  -- 2. Nullable. Every introducer accredited before today has no fee recorded,
  --    and a NOT NULL here would have made this migration unrunnable.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'introducer_applications'
     AND column_name IN ('fee_per_settlement','fee_notes')
     AND is_nullable = 'NO';
  IF n <> 0 THEN RAISE EXCEPTION '2 FAIL a fee column is NOT NULL'; END IF;
  RAISE NOTICE '2 OK  no fee recorded is not the same as a fee of nothing';

  -- 3. A paid application accepts a fee.
  INSERT INTO introducer_applications
    (legal_name, email, token_hash, token_expires_at, agreement_variant, fee_per_settlement)
  VALUES ('Verify Paid', 'verify-paid@example.invalid', 'verify-fee-paid',
          now() + interval '30 days', 'paid', '$2,500 per settled referral')
  RETURNING id INTO aid;
  RAISE NOTICE '3 OK  a paid arrangement can carry its agreed fee';

  -- 4. THE POINT OF THE CONSTRAINT: a standard arrangement cannot. Document 2
  --    says Springboard pays no referral fee; a fee stored beside it would
  --    contradict the contract it ships with.
  BEGIN
    UPDATE introducer_applications
       SET agreement_variant = 'standard'
     WHERE id = aid;
    RAISE EXCEPTION '4 FAIL a standard arrangement accepted a referral fee';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '4 OK  a fee cannot survive being moved onto standard terms';
  END;

  -- 5. And clearing the fee is what makes that move legal — the operator is
  --    told to choose, rather than silently having one of the two discarded.
  UPDATE introducer_applications
     SET fee_per_settlement = NULL, agreement_variant = 'standard'
   WHERE id = aid;
  SELECT count(*) INTO n FROM introducer_applications
   WHERE id = aid AND agreement_variant = 'standard' AND fee_per_settlement IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION '5 FAIL clearing the fee did not permit standard terms'; END IF;
  RAISE NOTICE '5 OK  clear the fee and the move is allowed';

  -- 6. An empty string is treated as no fee, not as a fee of "". Forms post
  --    blanks, and a blank must not become a contradiction.
  UPDATE introducer_applications SET fee_per_settlement = '   ' WHERE id = aid;
  RAISE NOTICE '6 OK  a blank fee on standard terms is not a fee';

  DELETE FROM introducer_applications WHERE id = aid;
  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;

ROLLBACK;
