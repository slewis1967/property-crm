-- A Tier 2 pack produces the document YLA actually receive.
--
-- Follow-up to 20260820_introducer_tier2_pack.sql, which is already applied in
-- production and must not be edited.
--
-- WHAT WAS WRONG. The pack collected a Borrower Fact Find and stopped there.
-- utils/yla-package.ts is explicit about why that is not enough:
--
--     NOTE the Fact Find is deliberately NOT here. Sean, 2026-07-25: YLA do not
--     receive a Fact Find — they receive a Needs Analysis. (The Fact Find goes
--     to BROKERS instead.)
--
-- So every Tier 2 pack was building a correct fact find, collecting the client's
-- documents, and then dead-ending at the YLA submission with "Needs Analysis —
-- not signed by every applicant yet". Not a silent failure — that path refuses
-- to send an incomplete set on purpose — but a wall the introducer and the
-- client only hit after all the work was done.
--
-- THREE THINGS THE PACK NOW ALSO DOES, and this migration records the links:
--
--   1. Creates CONTACTS for the applicants, like any other lead. Sean's call,
--      20 August 2026. Everything downstream resolves compliance documents by
--      `contact_id` — yla-package.ts does `.eq("contact_id", …)` — so a pack
--      with no contact could not be assembled even once the Needs Analysis
--      existed. `introducer_clients.contact_id` already existed (20260811) and
--      was never populated; now it is.
--
--   2. Derives the NEEDS ANALYSIS from the fact find, via the same
--      factFindToNeedsAnalysis bridge the staff "seed a Needs Analysis" button
--      uses. One mapping, not two.
--
--   3. Sends it to the client to SIGN. yla-package.ts requires the terminal
--      status AND captured signature marks — it checks both, because a package
--      once went out with status 'signed' and two empty signature boxes. A
--      draft Needs Analysis would look like progress and still block the
--      submission, so the client is asked to sign it at submit, alongside the
--      document-upload link they already receive.
--
-- Idempotent.

-- The Needs Analysis this pack produced. Soft FK, matching the posture of
-- `fact_find_id` beside it and `document_requests.fact_find_id`.
ALTER TABLE introducer_clients
  ADD COLUMN IF NOT EXISTS needs_analysis_id uuid;

COMMENT ON COLUMN introducer_clients.needs_analysis_id IS
  'The nccp_needs_analyses row this Tier 2 pack produced — the document YLA receive. '
  'Derived from fact_find_data at submit and sent to the client for signature.';

-- Which packs are still waiting on a client signature. Partial: only full packs
-- have one, and the question is only ever asked of those.
CREATE INDEX IF NOT EXISTS introducer_clients_needs_analysis_idx
  ON introducer_clients (needs_analysis_id)
  WHERE needs_analysis_id IS NOT NULL;

-- `contact_id` has existed since 20260811 but nothing ever wrote it. Indexed now
-- that it is populated, because "which packs belong to this person" becomes a
-- real query the moment a second referral arrives for the same client.
CREATE INDEX IF NOT EXISTS introducer_clients_contact_idx
  ON introducer_clients (contact_id)
  WHERE contact_id IS NOT NULL;

-- ── The lock is deliberately NOT extended ────────────────────────────────────
--
-- introducer_clients_locked_guard() defends the columns the INTRODUCER supplies.
-- `needs_analysis_id` and `contact_id` are ours: written by the submit path and
-- by staff afterwards, never by the portal. Adding them to the guard's changed-
-- column list would block our own writes on a submitted pack — the same trap the
-- 20260811 header warns about from the other direction, where staff-controlled
-- columns are explicitly outside the guard.
