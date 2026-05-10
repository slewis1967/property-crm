-- New "in_progress" status for recommendation_log so Sean can park
-- a rec he's actively working on (between pending and applied).
-- status is TEXT (no enum constraint), so storing 'in_progress' as a
-- value needs no schema change for the column itself; we just add
-- audit columns for when work started + who started it.

ALTER TABLE recommendation_log
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_by TEXT;
