-- Structured machine_action on recommendation_log so safe categories
-- (set_app_setting, deactivate/activate/confirm_builder, update_builder_field)
-- can be applied with one click from /advisor instead of needing a human
-- to translate the recommendation text into actual SQL/code changes.
--
-- Action shape:
--   { "kind": "set_app_setting", "key": "...", "value": ... }
--   { "kind": "deactivate_builder", "builder_id": "uuid" }
--   { "kind": "activate_builder",   "builder_id": "uuid" }
--   { "kind": "confirm_builder_draft", "builder_id": "uuid" }
--   { "kind": "update_builder_field", "builder_id": "uuid",
--     "field": "extraction_notes", "value": "..." }
--
-- Anything outside this allowlist is rejected by the executor and the
-- recommendation stays human-required (existing Apply / Dismiss / Snooze).

ALTER TABLE recommendation_log
  ADD COLUMN IF NOT EXISTS machine_action JSONB;

-- audit trail for executed machine actions
CREATE TABLE IF NOT EXISTS recommendation_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES recommendation_log(id) ON DELETE SET NULL,
  action JSONB NOT NULL,
  status TEXT NOT NULL,         -- 'success' | 'failed' | 'rejected'
  error TEXT,
  executed_by TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recommendation_action_log_rec_idx
  ON recommendation_action_log (recommendation_id, executed_at DESC);
