-- Which brand a signer sees when they sign.
--
-- THE BUG. The signing page, the "please sign" email and the signed-copy email
-- are all hardcoded "NextKey Property Strategists". That is correct for a
-- NextKey client signing a fact find. It is wrong for a SPRINGBOARD client
-- signing their Referral Consent and Privacy Form — they have never heard of
-- NextKey, and the form they are consenting to names Springboard Homes as the
-- party collecting their information. Being asked to sign it under a different
-- company's letterhead is, at best, a reason not to sign.
--
-- Everything else in the Springboard chain already gets this right: the document
-- upload portal, the reminder emails and the introducer portal are all
-- Springboard-branded, and utils/mailIdentities.ts already resolves a
-- `springboard` sender. Only the signature engine was left behind.
--
-- BRAND IS A PROPERTY OF THE REQUEST, NOT OF THE DOCUMENT TYPE. It is tempting
-- to map doc_type → brand, but the same document can belong to either business:
-- a Needs Analysis raised by staff for a NextKey client and one raised by a
-- Springboard introducer are the same doc_type and should not look the same to
-- the person signing. So whoever raises the request says which brand it is
-- under, and it is stored here.
--
-- DEFAULT 'nextkey', because that is what every existing row was sent under.
-- A row written before this column existed was seen by its signer as NextKey,
-- and the signed copy in their inbox says so; defaulting to anything else would
-- make the record disagree with what the person actually saw.
--
-- Idempotent.

ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'nextkey';

ALTER TABLE signature_requests DROP CONSTRAINT IF EXISTS signature_requests_brand_check;
ALTER TABLE signature_requests ADD CONSTRAINT signature_requests_brand_check
  CHECK (brand IN ('nextkey', 'springboard'));

COMMENT ON COLUMN signature_requests.brand IS
  'Which business the signer sees on the signing page and in both emails. Set by whoever '
  'raised the request; defaults to nextkey, which is what every pre-existing row was sent under.';
