-- Staff /feasibility: reports are written by a background function.
--
-- Same reason as partner reports (20261117d): a report takes 30-50s, and the
-- request path in front of the function gives up at ~30s (504) while the
-- function runs on. The staff tool does not auto-save, so a report that
-- finished after the 504 was simply lost.
--
-- One row per report request. The staff route inserts it ('pending', with the
-- engine input in `request`) and hands its id to
-- netlify/functions/feasibility-background.mts; the page polls
-- GET /api/ai/planning-feasibility/jobs/<id> and shows the report when it is
-- 'ready'. Saving to the CRM is unchanged (feasibility_reports, "Save to CRM").
--
-- Additive: a new table. RLS on with zero policies (service-role access).

CREATE TABLE IF NOT EXISTS feasibility_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      text,
  address         text,
  request         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  report          jsonb,
  error           text,
  job_started_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feasibility_jobs_created_idx ON feasibility_jobs (created_at DESC);

ALTER TABLE feasibility_jobs ENABLE ROW LEVEL SECURITY;
