-- A per-introducer override of the tier's builder-commission share.
--
-- WHAT THE ARRANGEMENT IS. Every accredited introducer sources their stock from
-- the Springboard builder panel and is paid a share of the commission the
-- builder pays Springboard on a settled matter: 75% at Tier 1, 90% at Tier 2.
-- That is the primary way an introducer earns, and it is distinct from the
-- Referral Fee added by 20260821f, which is a separate per-matter payment made
-- to some introducers out of Springboard's Program Fee. An introducer may have
-- both; they are cumulative and funded from different places.
--
-- OPTIONAL, AND DELIBERATELY SO. The tier default lives in code
-- (TIER_BUILDER_SHARE, applied by introducerDocDataFor at issue), so without
-- this column every introducer already gets the correct share for their tier.
-- The column exists only for someone who has negotiated a different split. That
-- means the column ladder in introducer-onboarding-db.ts degrades to CORRECT
-- behaviour rather than merely safe behaviour while this is pending — reading
-- "no override" is exactly right for all three live applications today.
--
-- WHY IT IS NOT A DEFAULTED COLUMN. Defaulting it to 75 or 90 in the database
-- would put a second copy of the tier rule somewhere it can drift from the
-- first, and would silently give a Tier 2 introducer 75% if the default were
-- ever applied to the wrong row. NULL means "ask the tier", which has exactly
-- one answer and one place that knows it.
--
-- Idempotent.

ALTER TABLE introducer_applications
  ADD COLUMN IF NOT EXISTS builder_share_pct numeric(5,2);

COMMENT ON COLUMN introducer_applications.builder_share_pct IS
  'Override of the tier default share of builder commission (t1 75, t2 90). NULL means use the '
  'tier default. Snapshotted into the agreement and the schedule at issue, so changing it after '
  'those documents are signed does not change what was agreed.';

-- A contract cannot promise a nonsensical percentage. The code refuses one too;
-- this is what survives a hand-edit in the SQL editor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'introducer_applications_builder_share_pct_range'
  ) THEN
    ALTER TABLE introducer_applications
      ADD CONSTRAINT introducer_applications_builder_share_pct_range
      CHECK (builder_share_pct IS NULL OR (builder_share_pct > 0 AND builder_share_pct <= 100));
  END IF;
END $$;
