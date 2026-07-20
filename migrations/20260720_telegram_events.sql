-- telegram_events — every message NEXUS sends through elvsnextkey_bot, plus the
-- Telegram API's verdict on it.
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS guards).
--
-- WHY THIS TABLE EXISTS
-- `elvsnextkey_bot` (TELEGRAM_BOT_TOKEN in /mnt/c/NEXUS-Memory/.env) is the bot
-- every NEXUS agent alerts through — oncall_agent, aggregator health, the
-- director/advisor chain, FB/IG/SEO crons, approvals. Those alerts only ever
-- landed on Sean's phone; nothing kept a record the CRM could read.
--
-- It CANNOT be backfilled by polling. The Telegram Bot API's getUpdates returns
-- only messages sent *to* a bot — a bot cannot read its own outbound history,
-- and delivery failures (bad chat_id, markdown parse errors, 429s) surface only
-- as the HTTP response at send time. So capture happens in the sender
-- (projects/nexus_notify.py) and this table is the record. Anything that sends
-- without going through that helper is invisible here — by construction, not by
-- accident. See docs/FEATURE-telegram-monitoring.md for the migration status of
-- the ~27 scripts that still inline their own sendMessage call.

create table if not exists telegram_events (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,                          -- originating script, e.g. 'oncall_agent'
  direction    text not null default 'outbound',       -- 'outbound' | 'inbound' (inbound reserved for replies/callbacks)
  chat_id      text,                                   -- target chat (usually Sean); null if the send never got that far
  text         text,                                   -- message body, truncated by the sender
  ok           boolean not null default true,          -- did Telegram accept it
  error_code   integer,                                -- Telegram error_code (400/403/429...) or the transport status
  error_desc   text,                                   -- Telegram 'description', or the local exception string
  severity     text not null default 'info',           -- 'info' | 'warning' | 'error' | 'critical'
  category     text,                                   -- classifier bucket, e.g. 'rate_limit', 'parse_error'
  meta         jsonb not null default '{}'::jsonb,     -- retry_after, message_id, anything sender-specific
  created_at   timestamptz not null default now()
);

-- The /health feed is "newest first", usually filtered to failures or to one
-- script, so index the three columns those queries actually sort/filter on.
create index if not exists telegram_events_created_idx  on telegram_events (created_at desc);
create index if not exists telegram_events_source_idx   on telegram_events (source, created_at desc);
-- Partial index: the error feed is the hot read and failures are the rare rows,
-- so keep the index small rather than indexing every successful send too.
create index if not exists telegram_events_failed_idx   on telegram_events (created_at desc) where ok = false;

-- Match the schema's posture: RLS on, default-deny. The browser anon key reads
-- nothing; server routes use the service key (utils/supabase.ts) which bypasses
-- RLS. NEXUS writes with SUPABASE_SERVICE_KEY, which also bypasses it.
alter table telegram_events enable row level security;
