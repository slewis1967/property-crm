-- ops_alerts — dedup / rate-limit ledger for the operational alerting sink
-- (utils/alert.ts). One row per alert `event_key`; the alerter reads it to
-- decide whether to send an escalation email or suppress it as a duplicate.
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS guards).
--
-- WHY: genuine failures (a broadcast that didn't enrol, an outbound send Brevo
-- rejected, an uncaught 5xx) used to vanish into Netlify stdout. alertOps now
-- emails the operator — but a route failing hundreds of times a minute must not
-- send hundreds of emails. This table records, per event_key, when we last
-- alerted and how many occurrences we've suppressed since, so alertOps sends at
-- most one email per event_key per window (env OPS_ALERT_WINDOW_MIN, default 15
-- min) and reports "+N similar suppressed" on the next alert that goes out.
--
-- GRACEFUL DEGRADATION: alert.ts degrades to a best-effort send (no dedup) if
-- this table is absent, so the app keeps working before this migration is run.
-- Apply it to activate rate-limiting.

create table if not exists ops_alerts (
  event_key             text primary key,
  last_sent_at          timestamptz,
  suppressed_since_last int not null default 0
);

-- The only lookup alertOps does is by primary key (event_key), so the PK index
-- suffices; this index is a defensive no-op if the PK is ever restructured.
create index if not exists ops_alerts_event_key_idx on ops_alerts (event_key);

-- Match the schema's posture: RLS on, default-deny. No PII here, but the
-- browser anon key has no business reading operational alert state. Server
-- routes use the service key (utils/supabase.ts), which bypasses RLS. Do not
-- add a permissive policy.
alter table ops_alerts enable row level security;
