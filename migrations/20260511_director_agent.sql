-- Director Agent — hires/fires other agents based on cost vs value.
-- Runs monthly (first Sunday) and reviews each agent's 30-day activity.
--
-- agent_registry is the source of truth for "which agents exist + their
-- status". Each managed agent checks its `paused` flag on startup and
-- exits cleanly if paused. Director can flip `paused` autonomously for
-- agents that have been silent / zero-value / cost-blown for 30+ days.
--
-- agent_review_log captures each monthly verdict so we can look back
-- at Director's track record (was it right to pause X? did the
-- hire-this-agent recommendation pay off?).

CREATE TABLE IF NOT EXISTS agent_registry (
  agent_name TEXT PRIMARY KEY,
  display_name TEXT,
  category TEXT,                -- 'advisor' | 'ingestion' | 'outreach' | 'ops' | 'content' | 'monitor'
  description TEXT,
  cron_schedule TEXT,           -- human-readable, e.g. "Fri 9am AEST"
  model TEXT,                   -- 'claude-sonnet-4-6' | 'claude-haiku-4-5' | 'n/a'
  cost_per_run_estimate_usd NUMERIC,
  paused BOOLEAN DEFAULT FALSE,
  paused_at TIMESTAMPTZ,
  paused_by TEXT,
  paused_reason TEXT,
  -- Tracked by Director on each review; sets the threshold for next time
  last_30d_runs INTEGER,
  last_30d_cost_usd NUMERIC,
  last_30d_value_metric TEXT,   -- human-readable, e.g. "8 recs (3 applied, 38%)"
  last_reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_review_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  agent_name TEXT,
  verdict TEXT,                  -- 'keep' | 'pause' | 'recommend_hire' | 'recommend_upgrade' | 'recommend_downgrade' | 'unpause'
  reasoning TEXT,
  metrics JSONB,                 -- snapshot of cost/runs/value at review time
  acted_autonomously BOOLEAN DEFAULT FALSE,
  -- Whether Director's recommendation is currently waiting on Sean
  awaiting_human BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolved_action TEXT
);

CREATE INDEX IF NOT EXISTS agent_review_log_pending_idx
  ON agent_review_log (reviewed_at DESC)
  WHERE awaiting_human = TRUE AND resolved_at IS NULL;

-- Monthly budget cap + actual spend snapshot. Director writes a row
-- per month; cron jobs read the latest row's `cap_exceeded` flag and
-- skip work if true (hard-stop). app_settings would also work but a
-- table gives us the monthly history for free.
CREATE TABLE IF NOT EXISTS ai_budget_month (
  year_month TEXT PRIMARY KEY,   -- '2026-05'
  budget_cap_usd NUMERIC,
  spend_usd NUMERIC,
  spend_breakdown JSONB,         -- {agent_name: cost} for the month
  cap_exceeded BOOLEAN DEFAULT FALSE,
  warning_sent_80pct BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the registry with current agents. Director will update the
-- last_30d_* fields on each review. Manual seed because we already
-- know the inventory + categories — no point asking the agent to
-- discover what we already know.
INSERT INTO agent_registry (agent_name, display_name, category, description, cron_schedule, model, cost_per_run_estimate_usd)
VALUES
  ('veteran_advisor',   'Veteran Advisor',   'advisor',  'Weekly self-improvement recommendations for the CRM/AI stack',         'Fri 9am AEST',           'claude-sonnet-4-6', 0.025),
  ('senior_advisor',    'Senior Advisor',    'advisor',  'AU-compliance + risk + market-context review of Veteran recs',         'Fri 9:30am AEST',        'claude-sonnet-4-6', 0.030),
  ('competitor_intel',  'Competitor Intel',  'advisor',  'Weekly scan of AU property-advisor competitors via web_search',        'Mon 9am AEST',           'claude-sonnet-4-6', 0.800),
  ('builder_outreach',  'Builder Outreach',  'outreach', 'Per-builder weekly stocklist-request emails for silent builders',      'Daily 9am AEST',         'claude-haiku-4-5',  0.005),
  ('oncall_agent',      'On-call SRE',       'monitor',  'Scans logs every 5 min, classifies errors, restarts dead workers',     'Every 5 min',            'claude-haiku-4-5',  0.001),
  ('email_monitor',     'Email Monitor',     'ingestion','Gmail OAuth poll for builder stocklist emails',                        'Every 15 min',           'n/a',               0),
  ('elvis_supabase_sync','Supabase Sync',    'ingestion','Two-way DuckDB <-> Supabase sync',                                     'Every 30 min',           'n/a',               0),
  ('sequence_runner',   'Sequence Runner',   'outreach', 'Email/SMS sequence runtime',                                           'Every 5 min',            'n/a',               0),
  ('nextkey_aggregator','Aggregator v2',     'ingestion','Builder-email ingestion via Claude Haiku',                             'Triggered by emails',    'claude-haiku-4-5',  0.005),
  ('elvis_youtube_pipeline','YouTube Pipeline','content','Scott Kuru channel monitor + content generation',                      'Every 6 hours',          'n/a (Ollama local)',0),
  ('elvis_fb_scheduler','Facebook Scheduler','content',  'Listing post 8am daily, market update Mon/Wed/Fri',                    'Daily / 3x weekly',      'n/a',               0),
  ('elvis_client_matcher','Client Matcher',  'ops',      'Daily AI-matchmaker pass on contacts',                                 'Daily 7pm AEST',         'claude-haiku-4-5',  0.020),
  ('elvis_enrichment_agent','Enrichment Agent','ingestion','Contact enrichment pass',                                            'Daily 3am AEST',         'claude-haiku-4-5',  0.010),
  ('elvis_self_improve','Self Improve',      'advisor',  'Legacy weekly self-improvement (predecessor to Veteran)',              'Sun 4am AEST',           'n/a',               0),
  ('elvis_youtube_learning','YouTube Learning','content','Weekly YouTube channel expansion',                                     'Sun 5am AEST',           'n/a',               0),
  ('elvis_daily_ops',   'Daily Ops',         'ops',      'Daily operational checks',                                             'Daily 6am AEST',         'n/a',               0),
  ('elvis_learning_engine','Learning Engine','advisor',  'Sunday weekly learning analysis',                                      'Sun 6am AEST',           'n/a',               0),
  ('elvis_fhb_tracker', 'FHB Tracker',       'ops',      'First-home-buyer eligibility tracker',                                 'Tue 6am AEST',           'n/a',               0),
  ('elvis_content_pipeline','Content Pipeline','content','Daily content research + generation (3 posts)',                        'Daily 7am AEST',         'n/a',               0)
ON CONFLICT (agent_name) DO NOTHING;
