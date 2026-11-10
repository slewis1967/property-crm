-- A document request says which Needs Analysis it belongs to.
--
-- `document_requests.fact_find_id` has been there since 20260720, from when the
-- declared position always came from a Borrower Fact Find. A Tier 2 pack no
-- longer produces one (see 20260820c), so a pack's document requests carry NULL
-- there and nothing on the row points at the document its uploads are evidence
-- FOR.
--
-- It still works today: the income reconciliation falls back to looking up the
-- newest Needs Analysis for the request's `contact_id`. But that is a search,
-- not a link. It quietly picks "the newest" when a contact has more than one —
-- a client referred twice, or one whose analysis was reissued — and there is
-- nothing on the request to say which one was meant. The right document is a
-- fact about this request, and facts about a row belong on the row.
--
-- So: an explicit link, and a resolution order of
--
--   needs_analysis_id   this request's own document
--   contact_id          the newest for that person   (staff-created requests)
--   fact_find_id        the fact find                (older requests)
--
-- `fact_find_id` is KEPT, not replaced. Staff requests raised from a fact find
-- still populate it, and every request created before today relies on it.
--
-- Idempotent.

ALTER TABLE document_requests
  ADD COLUMN IF NOT EXISTS needs_analysis_id uuid;

COMMENT ON COLUMN document_requests.needs_analysis_id IS
  'The nccp_needs_analyses row these uploads are evidence for. Soft FK, matching fact_find_id '
  'beside it. Set by the Tier 2 pack submit; NULL on requests raised from a fact find.';

-- Partial: the reconciliation asks "which Needs Analysis is this request for?",
-- and only pack-created rows have an answer.
CREATE INDEX IF NOT EXISTS document_requests_needs_analysis_idx
  ON document_requests (needs_analysis_id)
  WHERE needs_analysis_id IS NOT NULL;
