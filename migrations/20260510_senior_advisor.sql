-- Senior Advisor agent's verdict on each recommendation. Senior runs
-- after Veteran every Friday and decides per rec:
--   - approved   → Auto-Apply unlocked (if machine_action + risk!=high)
--   - rejected   → Auto-Apply blocked, reason shown in UI
--   - deferred   → "Sean's call" — visible but no auto-action
--   - pending_review → Senior hasn't run on this rec yet
--
-- risk_level captures Sean's "I'll only decide on risky stuff" rule.
-- Anything 'high' bypasses Auto-Apply even if approved (Sean reviews
-- manually). low/medium pass through.

ALTER TABLE recommendation_log
  ADD COLUMN IF NOT EXISTS senior_status TEXT DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS senior_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS senior_decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS senior_compliance_notes TEXT,
  ADD COLUMN IF NOT EXISTS risk_level TEXT;

-- Backfill: existing rows had no senior_status. Mark every still-pending
-- one as 'pending_review' so the next Senior run picks them up.
-- Already-applied/dismissed/snoozed ones stay NULL — Senior doesn't
-- retroactively review history.
UPDATE recommendation_log
   SET senior_status = 'pending_review'
 WHERE status IN ('pending', 'in_progress', 'snoozed')
   AND senior_status IS NULL;

CREATE INDEX IF NOT EXISTS recommendation_log_senior_idx
  ON recommendation_log (senior_status, status)
  WHERE senior_status = 'pending_review';
