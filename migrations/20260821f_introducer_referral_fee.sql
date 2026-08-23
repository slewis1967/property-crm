-- Where a paid introducer's referral fee is recorded.
--
-- RENAMED FROM 20260821c, AND ALREADY APPLIED IN PRODUCTION. It was written as
-- `20260821c_introducer_referral_fee.sql` and run under that name on 2026-08-20;
-- `fee_per_settlement` and `fee_notes` are live, and SBI-2026-0005 already
-- carries an amount. Meanwhile 20260821c and 20260821d were taken on master by
-- the introducer_events pair, so two different files were claiming each ordinal
-- and the order to run them in stopped being readable. Renumbered to f/g to
-- settle that. Idempotent, so re-running it against production is a no-op — but
-- it does not need running again.
--
-- WHY THIS IS NEEDED NOW. `readyToIssue` refuses a commission schedule on the
-- `paid` variant with no fee amount — correctly, because "a contract about
-- nothing" is its exact objection, and a schedule promising an unstated sum is
-- worse than no schedule. But there was nowhere to state the amount. Every paid
-- introducer was therefore un-issuable the moment the agreement step was wired,
-- which is where SBI-2026-0005 sits today.
--
-- ON THE APPLICATION, NOT ON THE DOCUMENT. The document snapshots it at issue,
-- as it snapshots everything else, and must go on reading as it read when it was
-- signed. But the fee has to be decided BEFORE the document exists — that is the
-- whole point — and it has to survive a re-issue and be visible to both the
-- staff path and the applicant's own "sign it now" button. So the application
-- carries the agreed terms, and each document takes its copy.
--
-- FREE TEXT, DELIBERATELY. Not numeric. Real referral terms are not always a
-- single dollar amount — "$2,500 per settled referral", "0.25% of purchase
-- price", "$1,500 rising to $2,000 after ten settlements" are all things
-- Springboard may agree to, and a numeric column would force whoever typed it
-- to lie. It is rendered verbatim into a contract; it is not arithmetic.

ALTER TABLE introducer_applications
  ADD COLUMN IF NOT EXISTS fee_per_settlement text,
  ADD COLUMN IF NOT EXISTS fee_notes          text;

COMMENT ON COLUMN introducer_applications.fee_per_settlement IS
  'Referral fee per settled referral, as agreed, rendered verbatim into the commission '
  'schedule. Required before a `paid` schedule can issue; must stay NULL on `standard`, '
  'where the agreement says no fee is payable.';
COMMENT ON COLUMN introducer_applications.fee_notes IS
  'Any qualification on the fee — when it is payable, clawback, caps. Rendered with it.';

-- A fee on a standard arrangement contradicts the agreement it ships beside:
-- Document 2 says Springboard pays no referral fee. `readyToIssue` already
-- refuses that combination, but a constraint is what stops it being written in
-- the first place, and the code guard is not the one that survives a hand-edit
-- in the SQL editor.
ALTER TABLE introducer_applications
  DROP CONSTRAINT IF EXISTS introducer_applications_fee_matches_variant;
ALTER TABLE introducer_applications
  ADD CONSTRAINT introducer_applications_fee_matches_variant
  CHECK (
    agreement_variant = 'paid'
    OR fee_per_settlement IS NULL
    OR btrim(fee_per_settlement) = ''
  );
