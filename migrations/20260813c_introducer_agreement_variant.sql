-- Which commercial terms an introducer is on.
--
-- A paid variant of the referral agreement was added on 13 August 2026:
-- identical to the standard document except Springboard pays a Referral Fee per
-- settled referral, offered by invitation to a hand-picked cohort. Until now the
-- pipeline had no idea the distinction existed, so a paid-cohort introducer
-- would have been issued the standard agreement -- the one that says Springboard
-- pays them nothing.
--
-- DEFAULT 'standard', so every application that already exists keeps the terms it
-- was started under. Nobody gets moved onto a paid arrangement by a migration.
--
-- A CHECK rather than free text, for the same reason as `tier`: the commercial
-- terms an introducer is on is not something a typo should be able to invent.
ALTER TABLE introducer_applications
  ADD COLUMN IF NOT EXISTS agreement_variant text NOT NULL DEFAULT 'standard';

ALTER TABLE introducer_applications DROP CONSTRAINT IF EXISTS introducer_applications_variant_check;
ALTER TABLE introducer_applications ADD CONSTRAINT introducer_applications_variant_check
  CHECK (agreement_variant IN ('standard','paid'));

CREATE INDEX IF NOT EXISTS introducer_applications_variant_idx
  ON introducer_applications (agreement_variant)
  WHERE agreement_variant = 'paid';

COMMENT ON COLUMN introducer_applications.agreement_variant IS
  'standard = Document 2 (no referral fee). paid = Document 2A + addendum 2B, '
  'invitation only, Referral Fee per settled referral. Drives which agreement and '
  'commission schedule are issued.';
