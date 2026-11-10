-- Introducer applicants supply their own business details.
--
-- WHY. The referral agreement is a contract with the applicant's ENTITY, not
-- with them personally, and the pipeline had nowhere to put one. `firm_name`
-- and `abn` existed but were staff-entered at invite and are routinely blank —
-- both live applicants have no ABN and one has no firm name at all. There was
-- no ACN field anywhere. That surfaces late and badly: the agreement renders
-- with blanks in the party clause, which is exactly the part of a contract that
-- has to be right.
--
-- These are the applicant's to state, unlike their legal name. The onboarding
-- module's ONE RULE — identity is issued, never typed — is about who they ARE:
-- staff state the name the certificate prints and the exam invite is signed
-- with, so nobody can accredit themselves under a name of their choosing. The
-- ABN of their company is a different kind of fact. They know it, we don't, and
-- it is checkable against a public register, so asking them for it takes
-- nothing away from that rule.
--
-- Safe to apply before or after the code deploys: every read tolerates the
-- columns being absent via introducerOnboardingColumnMissing().

ALTER TABLE introducer_applications ADD COLUMN IF NOT EXISTS acn text;
ALTER TABLE introducer_applications ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE introducer_applications ADD COLUMN IF NOT EXISTS registered_address text;

-- When the applicant last confirmed these. Null means never — which is the
-- difference between "they told us their company has no ACN because it is a
-- sole trader" and "nobody has ever asked".
ALTER TABLE introducer_applications ADD COLUMN IF NOT EXISTS business_details_at timestamptz;

COMMENT ON COLUMN introducer_applications.acn IS
  'Applicant-supplied ACN, digits only (9). Blank for sole traders and partnerships, which have none.';
COMMENT ON COLUMN introducer_applications.entity_type IS
  'sole_trader | company | trust | partnership — decides which of ABN/ACN is expected.';
COMMENT ON COLUMN introducer_applications.registered_address IS
  'The entity address the agreement is executed against and notices are sent to.';
COMMENT ON COLUMN introducer_applications.business_details_at IS
  'When the applicant last confirmed their business details. NULL = never asked/never answered.';
