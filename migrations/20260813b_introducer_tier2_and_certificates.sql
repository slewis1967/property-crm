-- Follow-up to 20260813_introducer_onboarding.sql, which is already applied in
-- production and must not be edited.
--
-- TWO CHANGES.
--
-- 1. TIER 2 IS NOW OFFERABLE. It was refused by a CHECK constraint rather than by
--    convention, because Tier 2 collects a fact find and an NCCP Needs Analysis
--    and that reads as credit assistance -- which Springboard held no licence
--    for. Sean confirmed on 13 August 2026 that the credit-licensing advice
--    covers it. The constraint widens; nothing else about how tiers work changes.
--
--    Deliberately still a CHECK rather than free text. If the position ever
--    moves again, the schema is where that gets recorded.
--
-- 2. CERTIFICATES GET A HOME. `certificate_path` already existed on the
--    application; this adds the private bucket the file actually goes in, plus
--    the issue timestamp, so a reissued certificate can be told from the first.

ALTER TABLE introducer_applications DROP CONSTRAINT IF EXISTS introducer_applications_tier_check;
ALTER TABLE introducer_applications ADD CONSTRAINT introducer_applications_tier_check
  CHECK (tier IN ('t1','t2'));

ALTER TABLE introducer_applications
  ADD COLUMN IF NOT EXISTS certificate_issued_at timestamptz;

-- Certificates and signed agreements are evidence of accreditation, not identity
-- evidence, so they get their own bucket rather than sharing the licence one --
-- which has a deletion clock on it that these documents must not inherit.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'introducer-records', 'introducer-records', false, 15728640,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
