-- Partner feasibility allowance: claim the slot BEFORE the model runs.
--
-- Counting saved reports after the fact let two parallel requests both see
-- "9 of 10 used" and both run, and a report whose save failed was never
-- counted at all. Now a report request first calls claim_partner_feasibility_slot,
-- which takes a per-firm advisory lock, counts this month's pending + ready
-- rows, and inserts a 'pending' row only if under the allowance. The row is
-- filled in ('ready') when the report arrives. It is deleted only when the
-- engine refused the request BEFORE calling the model (a 400: nothing was
-- spent). A failure after a model call, or a failed SAVE, leaves it pending,
-- which still counts, so failing on purpose cannot buy extra model runs.
--
-- Additive: one column, one relaxed NOT NULL, one function. Applies to a table
-- created the same day (20261117b).

ALTER TABLE partner_feasibility_reports
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('pending', 'ready'));
ALTER TABLE partner_feasibility_reports ALTER COLUMN report DROP NOT NULL;

CREATE OR REPLACE FUNCTION claim_partner_feasibility_slot(
  p_partner_id  uuid,
  p_user_id     uuid,
  p_address     text,
  p_objective   text,
  p_allowance   integer,
  p_since       timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  used integer;
  new_id uuid;
BEGIN
  -- Serialise claims per firm for the rest of this transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('partner_feasibility:' || p_partner_id::text, 0));
  SELECT count(*) INTO used
    FROM partner_feasibility_reports
   WHERE partner_id = p_partner_id
     AND created_at >= p_since
     AND status IN ('pending', 'ready');
  IF used >= p_allowance THEN
    RETURN NULL;
  END IF;
  INSERT INTO partner_feasibility_reports (partner_id, created_by_user_id, address, objective, status, report)
  VALUES (p_partner_id, p_user_id, p_address, p_objective, 'pending', NULL)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- Service role only, like the tables: the anon key must not be able to claim slots.
REVOKE ALL ON FUNCTION claim_partner_feasibility_slot(uuid, uuid, text, text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_partner_feasibility_slot(uuid, uuid, text, text, integer, timestamptz) TO service_role;
