-- An introducer document can be amended and re-issued.
--
-- WHY THIS IS NEEDED. On 21 August two introducers signed a referral agreement
-- whose clause 2 described the client wanting to "build with" a builder. The
-- programme sells completed homes; there is no construction. The wording had to
-- be corrected and the corrected version signed.
--
-- There was no way to do that. `ensureIntroducerDoc` is idempotent on
-- (application_id, doc_type) and returns the OLDEST row, which is what stops a
-- signer minting a second document by opening their link twice. The same
-- property makes re-issue impossible: a corrected agreement would never be
-- reached, and `openIntroducerDocSigning` would refuse anyway because the
-- request row is already `signed`.
--
-- THE SIGNED DOCUMENT IS NOT EDITED, AND NOT DELETED. It is evidence of what
-- that person actually agreed to on that date, and it stays exactly as it was —
-- rewriting a signed instrument in place is the one thing a compliance document
-- store must never do, and it would also invalidate the signature captured
-- against its content. Instead the old row is marked superseded and a new row
-- is issued beside it, so the pair reads as "this replaced that, on this date".
--
--   superseded_at   when it stopped being the operative document
--   superseded_by   the document that replaced it
--
-- Everything that asks "which document is live" filters on superseded_at IS
-- NULL: ensureIntroducerDoc, signedDocTypes and signedDocTypesFor. That last
-- one matters most — without it an application whose superseded agreement was
-- signed would report the step complete while the amended document sat
-- unsigned, which is precisely the false "all done" this exists to prevent.
--
-- Idempotent.

ALTER TABLE introducer_agreement_docs
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid;

COMMENT ON COLUMN introducer_agreement_docs.superseded_at IS
  'When this document was replaced by an amended one. NULL means it is the operative document. '
  'A superseded row is never edited or deleted — it is what the signer actually agreed to.';

COMMENT ON COLUMN introducer_agreement_docs.superseded_by IS
  'The introducer_agreement_docs row that replaced this one. Soft FK, matching the style of the '
  'other cross-references in this schema.';

-- "Which document is live for this application and type" is the hot question,
-- asked on every signing open and on every admin list render.
CREATE INDEX IF NOT EXISTS introducer_agreement_docs_live_idx
  ON introducer_agreement_docs (application_id, doc_type)
  WHERE superseded_at IS NULL;
