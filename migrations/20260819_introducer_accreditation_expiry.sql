-- Accreditation expires. Until now that was only true on paper.
--
-- The referral agreement says no fee is payable for a referral made before
-- accreditation was complete, or while it was suspended or expired. Nothing in
-- the CRM knew when an accreditation ran out, so the rule was enforced by
-- whoever remembered to look. These two dates are what make it enforceable, and
-- they match `expiry_date` and `smsf_competency_expiry` on the compliance
-- register.
--
-- TWO CLOCKS, DELIBERATELY. Accreditation runs 12 months. The SMSF competency
-- inside it runs 6 -- M4 is 23% of the Tier 1 exam and the material most likely
-- to go stale, so it is re-tested twice as often as the accreditation around it.
-- One date cannot express that, and deriving the second from the first at the
-- point of use is how they drift apart.
--
-- DATE, NOT TIMESTAMPTZ. An expiry is a calendar day. Stored as an instant it
-- acquires a timezone, and an accreditation that lapses at 10am Brisbane on the
-- 14th because the server read midnight UTC is a bug nobody finds until someone
-- is locked out mid-referral.
--
-- NULLABLE, AND NULL IS NOT EXPIRED. Every introducer accredited before today
-- has no date on their row. The application code treats a missing expiry as
-- "not recorded" rather than "expired" -- locking every existing introducer out
-- of the portal on the day this deploys would be a worse failure than the one
-- being fixed. Backfilling is a decision for whoever holds the register, not
-- for a migration.

-- ── The application: where the dates are derived ────────────────────────────
--
-- Both follow from `certificate_issued_at`, computed once when the certificate
-- is issued rather than every time they are read. A reissued certificate -- a
-- name correction, a lost copy -- must NOT push the expiry out, so the
-- derivation runs off the FIRST issue date and the application is where that is
-- known.

ALTER TABLE introducer_applications
  ADD COLUMN IF NOT EXISTS accreditation_expires_at   date,
  ADD COLUMN IF NOT EXISTS smsf_competency_expires_at date;

COMMENT ON COLUMN introducer_applications.accreditation_expires_at IS
  'Calendar day the accreditation lapses. certificate_issued_at + 12 months, '
  'clamped to month end. Set on first issue; a reissue never extends it.';
COMMENT ON COLUMN introducer_applications.smsf_competency_expires_at IS
  'Calendar day the SMSF competency lapses. certificate_issued_at + 6 months, '
  'clamped to month end. Half the accreditation term, by design.';

-- ── The firm: where the dates are enforced ──────────────────────────────────
--
-- Referrals are scoped by introducer_id, so that is the row the submit path has
-- in its hand. Copied here at activation rather than joined back to the
-- application on every submit: the join would be a second query on the hot path,
-- and the firm row is the one a suspension or a manual correction is applied to.
--
-- accreditation_no lands here too. It was already being written into
-- `agreement_ref` at activation, which was true -- the number IS what the
-- agreement cites -- but it made the register's primary key something you had to
-- know to look for under another name.

ALTER TABLE introducers
  ADD COLUMN IF NOT EXISTS accreditation_no           text,
  ADD COLUMN IF NOT EXISTS accreditation_expires_at   date,
  ADD COLUMN IF NOT EXISTS smsf_competency_expires_at date;

COMMENT ON COLUMN introducers.accreditation_no IS
  'The accreditation number of the person this firm was activated for. Same '
  'value as agreement_ref, under the name the register uses.';
COMMENT ON COLUMN introducers.accreditation_expires_at IS
  'Copied from the application at activation. Submitting a referral is refused '
  'once this day has passed. NULL means not recorded, never expired.';
COMMENT ON COLUMN introducers.smsf_competency_expires_at IS
  'Copied from the application at activation. Reported, not enforced: a lapsed '
  'SMSF competency narrows what an introducer may discuss, it does not stop a '
  'referral.';

-- Partial: the query behind the expiry panel asks for the ones that have a date
-- and are near it, and the great majority of rows have neither.
CREATE INDEX IF NOT EXISTS introducers_accreditation_expiry_idx
  ON introducers (accreditation_expires_at)
  WHERE accreditation_expires_at IS NOT NULL;

-- ── Which tier the firm holds ───────────────────────────────────────────────
--
-- The two tiers carry materially different permissions: Tier 1 refers, Tier 2
-- also completes the fact find and collects documents. The APPLICATION has
-- always recorded which one a person was examined at; the firm did not, so
-- nothing downstream of activation could tell them apart.
--
-- Copied at activation, from the tier they actually passed. DEFAULT 't1' is the
-- safe direction: an unrecorded tier must never be read as the wider authority.
--
-- RECORDED NOW, ENFORCED WHEN THERE IS SOMETHING TO ENFORCE. The portal has no
-- Tier 2 affordance yet -- no fact find, no document collection -- so there is
-- currently nothing for this column to gate. It goes in now because the moment
-- one of those ships, the alternative is a feature that decides authority from
-- the application table by joining backwards, which is how the wrong person
-- ends up with it.
ALTER TABLE introducers
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 't1';

ALTER TABLE introducers DROP CONSTRAINT IF EXISTS introducers_tier_check;
ALTER TABLE introducers ADD CONSTRAINT introducers_tier_check
  CHECK (tier IN ('t1','t2'));

COMMENT ON COLUMN introducers.tier IS
  'The accreditation tier the firm''s accredited person holds. t1 refers; t2 '
  'also completes the fact find and collects documents. Copied from the '
  'application at activation; defaults to t1, never upwards.';
