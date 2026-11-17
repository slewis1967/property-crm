-- Partner feasibility reports are written by a background function.
--
-- Why: a report is a long Sonnet + web-search run (31-50s measured on
-- 31 Oct 2026). Run synchronously, the first live partner report on
-- 17 Nov 2026 got a 504 at 31s, yet the function carried on and saved a full
-- report: the request path in front of the function gives up at ~30s while
-- Netlify lets the function itself run 60s. So the browser must not wait on
-- the model. Netlify background functions have 15 minutes. So the API claims the slot and stores the request on the row;
-- netlify/functions/partner-feasibility-background.mts picks it up, writes the
-- report, and the portal page polls the row.
--
--   request       the engine input (address, messages, prepared location)
--   job_started_at set once, by a conditional update, so a duplicate trigger
--                 cannot run the model twice for one slot
--   error         shown to the partner when status = 'failed'
--   status        pending -> ready | failed. All three count toward the
--                 monthly allowance; only a request refused before the model
--                 is called is deleted (released).
--
-- Additive: three nullable columns, a widened CHECK, the claim function
-- recounting 'failed' as used.

ALTER TABLE partner_feasibility_reports ADD COLUMN IF NOT EXISTS request jsonb;
ALTER TABLE partner_feasibility_reports ADD COLUMN IF NOT EXISTS job_started_at timestamptz;
ALTER TABLE partner_feasibility_reports ADD COLUMN IF NOT EXISTS error text;

ALTER TABLE partner_feasibility_reports DROP CONSTRAINT IF EXISTS partner_feasibility_reports_status_check;
ALTER TABLE partner_feasibility_reports
  ADD CONSTRAINT partner_feasibility_reports_status_check CHECK (status IN ('pending', 'ready', 'failed'));

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
  PERFORM pg_advisory_xact_lock(hashtextextended('partner_feasibility:' || p_partner_id::text, 0));
  SELECT count(*) INTO used
    FROM partner_feasibility_reports
   WHERE partner_id = p_partner_id
     AND created_at >= p_since
     AND status IN ('pending', 'ready', 'failed');
  IF used >= p_allowance THEN
    RETURN NULL;
  END IF;
  INSERT INTO partner_feasibility_reports (partner_id, created_by_user_id, address, objective, status, report)
  VALUES (p_partner_id, p_user_id, p_address, p_objective, 'pending', NULL)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION claim_partner_feasibility_slot(uuid, uuid, text, text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_partner_feasibility_slot(uuid, uuid, text, text, integer, timestamptz) TO service_role;
