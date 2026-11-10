-- Introducer onboarding — more than one live link per applicant.
--
-- WHAT WENT WRONG. `introducer_applications` carries a single `token_hash`, and
-- every step email mints a replacement (utils/introducer-onboarding-db.ts,
-- `reissueToken`). Minting is therefore also revoking: the moment the next
-- email goes out, the link in the previous one stops resolving and the
-- candidate gets "We can't open this link".
--
-- That is not a rare race. Issuing a certificate and sending the agreement are
-- two clicks a staff member makes back to back, and each sends its own email.
-- On 2026-08-19 SBI-2026-0004's "you've passed" email was invalidated NINE
-- SECONDS after it was sent, by the agreement email that followed it; SBI-2026-
-- 0005 the same the next morning, twenty-one seconds apart. Both candidates
-- were left holding a dead link to the page their certificate lives on.
--
-- WHAT THIS CHANGES. Onboarding links move out of the application row and into
-- their own table, one row per link. Every link an applicant has been sent
-- stays good until it expires, so which email they happen to open no longer
-- decides whether they get in. Nothing else about the flow changes — same raw
-- token in the same URL, same thirty-day window, same state machine behind it.
--
-- WHAT DOES NOT CHANGE: rule 1 of the onboarding schema. We still store only
-- the SHA-256 hash, never the raw token, so a leak of this table yields hashes
-- and not working links. The rule was never "one token"; it was "no raw
-- tokens", and that survives intact.
--
-- REVOCATION still exists, and is now the deliberate act it should always have
-- been: `revoked_at`, set when a link is known to have gone astray, rather than
-- as a side effect of sending an unrelated email. The application row keeps its
-- `token_hash`/`token_expires_at` columns, still pointing at the newest link,
-- both so a deploy that lands before this SQL keeps working and so nothing that
-- reads the row has to learn about a second table.

CREATE TABLE IF NOT EXISTS introducer_application_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES introducer_applications(id) ON DELETE CASCADE,

  -- SHA-256 hex of the raw token — NEVER the raw token. Unique across every
  -- application, so a hash collision cannot resolve to the wrong candidate.
  token_hash      text NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,

  -- Why this link was minted: 'invite', 'nda', 'exam', 'certificate',
  -- 'agreement', 'reissue'. Free text rather than a CHECK — it is for reading
  -- the audit file, and a new step should not need a migration to be logged.
  purpose         text,

  -- Set when a link is deliberately killed. Sending another email does not set
  -- it; that was the bug.
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS introducer_application_tokens_hash_idx
  ON introducer_application_tokens (token_hash);
CREATE INDEX IF NOT EXISTS introducer_application_tokens_app_idx
  ON introducer_application_tokens (application_id, created_at DESC);

-- Backfill, so the links already in people's inboxes survive this migration.
-- One row per application, carrying whatever token that row currently holds.
INSERT INTO introducer_application_tokens (application_id, token_hash, expires_at, purpose, created_at)
SELECT a.id, a.token_hash, a.token_expires_at, 'backfill', a.updated_at
FROM introducer_applications a
ON CONFLICT (token_hash) DO NOTHING;

-- Service-role only, like every other table in this pipeline: RLS on, no
-- policies, so the anon key cannot read a hash even by accident.
ALTER TABLE introducer_application_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE introducer_application_tokens IS
  'Onboarding links, one row per link. Every unexpired, unrevoked row resolves; '
  'sending a new email no longer breaks the last one. Hashes only, never raw tokens.';
