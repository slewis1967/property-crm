-- Feedback AI pipeline: triage + autonomous-agent columns on the feedback table.
-- Safe to run repeatedly (all IF NOT EXISTS).

alter table feedback add column if not exists ai_kind       text;              -- bug | feature | other (AI's read)
alter table feedback add column if not exists ai_genuine    boolean;           -- a real, actionable item?
alter table feedback add column if not exists ai_severity   text;              -- low | medium | high
alter table feedback add column if not exists ai_risk_class boolean not null default false; -- touches auth/access/delete/payment/sending
alter table feedback add column if not exists ai_summary    text;              -- one-line AI summary
alter table feedback add column if not exists ai_analysis   text;              -- root-cause / reasoning / skip reason
alter table feedback add column if not exists ai_confidence numeric;           -- 0..1

-- Automation pipeline, driven by the cloud routine:
--   pending -> triaged -> working -> (shipped | built | awaiting_signoff | skipped | error)
--   awaiting_signoff + signoff=approved -> working -> built/shipped
alter table feedback add column if not exists agent_stage text not null default 'pending';
alter table feedback add column if not exists pr_url      text;                -- PR the agent opened
alter table feedback add column if not exists plan        text;                -- feature implementation plan (markdown)
alter table feedback add column if not exists signoff     text;                -- null | approved | rejected
alter table feedback add column if not exists signoff_by  text;
alter table feedback add column if not exists signoff_at  timestamptz;
alter table feedback add column if not exists agent_error text;
alter table feedback add column if not exists triaged_at   timestamptz;
alter table feedback add column if not exists processed_at timestamptz;

create index if not exists feedback_agent_stage_idx on feedback (agent_stage, created_at);
