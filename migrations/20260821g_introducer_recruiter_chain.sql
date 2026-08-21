-- Introducers who recruit other introducers.
--
-- THE ARRANGEMENT. One accredited introducer (a BDM) recruits others into the
-- programme and is paid the Referral Fee on any settled referral submitted by
-- someone they recruited, as well as on their own. Whether the BDM then pays
-- their recruit anything is the BDM's own commercial decision, made outside
-- Springboard's documents and with Springboard's money already spent.
--
-- TWO FACTS, NOT ONE. `recruited_by_introducer_id` says who brought this
-- introducer in; `recruits_introducers` says this one is entitled to be paid on
-- their network's settlements. They are deliberately separate. Recording who
-- introduced whom is useful for every introducer — it is how you know where
-- your panel came from — and must not, by itself, create a payment
-- entitlement. The entitlement is a term of an agreement somebody signed, so it
-- gets its own flag, is invitation-only like the paid variant itself, and is
-- snapshotted into the commission schedule at issue.
--
-- WHY THE RECRUIT IS STILL FULLY ACCREDITED. The recruit is the one in front of
-- the client, so the recruit is the one who must hold the accreditation, sign
-- the NDA and the agreement, and pass the ID check — exactly as if they had
-- come to us directly. This column records a relationship between two
-- accredited parties; it is not a lighter way in. Nothing in this migration
-- creates a path to introducing clients without accreditation, and nothing
-- should be built on it that does.
--
-- SELF-REFERENCE IS REFUSED. An introducer cannot recruit themselves, which
-- would otherwise be an easy way to double-count a settlement.

-- -- The panel ------------------------------------------------------------------
ALTER TABLE introducers
  ADD COLUMN IF NOT EXISTS recruited_by_introducer_id uuid REFERENCES introducers(id),
  ADD COLUMN IF NOT EXISTS recruits_introducers       boolean NOT NULL DEFAULT false;

ALTER TABLE introducers
  DROP CONSTRAINT IF EXISTS introducers_not_own_recruiter;
ALTER TABLE introducers
  ADD CONSTRAINT introducers_not_own_recruiter
  CHECK (recruited_by_introducer_id IS NULL OR recruited_by_introducer_id <> id);

CREATE INDEX IF NOT EXISTS introducers_recruited_by_idx
  ON introducers (recruited_by_introducer_id)
  WHERE recruited_by_introducer_id IS NOT NULL;

-- -- The runway -----------------------------------------------------------------
-- Carried on the application too, because the recruiter is known when the
-- invitation is sent — long before the introducer row exists — and the
-- commission schedule is issued and signed while the candidate is still an
-- application. Activation copies both across.
ALTER TABLE introducer_applications
  ADD COLUMN IF NOT EXISTS recruited_by_introducer_id uuid REFERENCES introducers(id),
  ADD COLUMN IF NOT EXISTS recruits_introducers       boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS introducer_applications_recruited_by_idx
  ON introducer_applications (recruited_by_introducer_id)
  WHERE recruited_by_introducer_id IS NOT NULL;

-- A network entitlement is a fee entitlement, and fees exist only on the paid
-- variant — the standard agreement says Springboard pays nothing at all, so a
-- standard introducer earning on a network would contradict the document they
-- signed. Same reasoning as the fee constraint in 20260821c.
ALTER TABLE introducer_applications
  DROP CONSTRAINT IF EXISTS introducer_applications_recruiter_is_paid;
ALTER TABLE introducer_applications
  ADD CONSTRAINT introducer_applications_recruiter_is_paid
  CHECK (recruits_introducers = false OR agreement_variant = 'paid');

COMMENT ON COLUMN introducers.recruited_by_introducer_id IS
  'The accredited introducer who brought this one into the programme. Attribution only — '
  'the recruit is separately and fully accredited.';
COMMENT ON COLUMN introducers.recruits_introducers IS
  'This introducer is paid the Referral Fee on settled referrals submitted by introducers '
  'they recruited, as well as on their own. Invitation only; stated in their signed schedule.';
