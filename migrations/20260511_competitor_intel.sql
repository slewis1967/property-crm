-- Competitor intelligence — weekly Monday agent scans public AU sources
-- for property-advisor competitor moves (new features, pricing, positioning,
-- partnerships, leadership changes). Senior Advisor reads the latest 7 days
-- of findings on its Friday run so verdicts factor in market context.

CREATE TABLE IF NOT EXISTS competitor_intel_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT,                  -- 'running' | 'completed' | 'failed'
  findings_count INTEGER DEFAULT 0,
  ai_cost_usd NUMERIC DEFAULT 0,
  ai_input_tokens INTEGER DEFAULT 0,
  ai_output_tokens INTEGER DEFAULT 0,
  error TEXT,
  model TEXT
);

CREATE TABLE IF NOT EXISTS competitor_intel_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES competitor_intel_run(id) ON DELETE SET NULL,
  competitor_name TEXT NOT NULL,
  finding_type TEXT NOT NULL,   -- 'feature' | 'pricing' | 'positioning' |
                                -- 'partnership' | 'leadership_change' |
                                -- 'marketing_campaign' | 'other'
  title TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  source_published_at DATE,
  confidence_score NUMERIC,     -- 0-1 from the agent
  strategic_relevance TEXT,     -- short note on why NextKey should care
  observed_at TIMESTAMPTZ DEFAULT NOW(),
  -- Sean can mark a finding as not-useful so future runs deprioritise
  -- the same noise. Senior also ignores dismissed findings.
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  dismissed_reason TEXT
);

CREATE INDEX IF NOT EXISTS competitor_intel_log_recent_idx
  ON competitor_intel_log (observed_at DESC)
  WHERE dismissed = FALSE;

CREATE INDEX IF NOT EXISTS competitor_intel_log_competitor_idx
  ON competitor_intel_log (competitor_name, observed_at DESC);
