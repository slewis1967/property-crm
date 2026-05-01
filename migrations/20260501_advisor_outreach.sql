-- Veteran Advisor + Builder Outreach (2026-05-01)
--
-- Adds:
--   1. recommendation_log — output of weekly veteran_advisor.py runs
--   2. builder_outreach_log — sent emails + reply tracking
--   3. auto_outreach_enabled column on builders
--   4. last_contact_at column on builders (for outreach scheduling)
--
-- Idempotent.

-- ── 1. Recommendations from the Veteran agent ────────────────────────────────
create table if not exists public.recommendation_log (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null,
  title               text not null,
  description         text not null,
  rationale           text,
  suggested_action    text,
  code_refs           jsonb default '[]'::jsonb,
  confidence          numeric(3,2),
  impact              text,
  status              text default 'pending',
  snoozed_until       timestamptz,
  applied_at          timestamptz,
  applied_by          text,
  dismissed_at        timestamptz,
  dismissed_reason    text,
  source_metrics      jsonb default '{}'::jsonb,
  generated_by_run_id uuid,
  created_at          timestamptz default now()
);

create index if not exists rec_log_status_idx on public.recommendation_log(status);
create index if not exists rec_log_kind_idx on public.recommendation_log(kind);
create index if not exists rec_log_created_at_idx on public.recommendation_log(created_at desc);
create index if not exists rec_log_snoozed_until_idx on public.recommendation_log(snoozed_until)
  where status = 'snoozed';

-- ── 2. Builder outreach log ─────────────────────────────────────────────────
create table if not exists public.builder_outreach_log (
  id                    uuid primary key default gen_random_uuid(),
  builder_id            uuid references public.builders(id) on delete cascade,
  to_email              text not null,
  from_email            text,
  subject               text,
  body_text             text,
  brevo_message_id      text,
  status                text not null,
  error                 text,
  sent_at               timestamptz default now(),
  reply_received_at     timestamptz,
  reply_classification  text,
  reply_excerpt         text
);

create index if not exists outreach_builder_id_idx on public.builder_outreach_log(builder_id);
create index if not exists outreach_sent_at_idx on public.builder_outreach_log(sent_at desc);
create index if not exists outreach_status_idx on public.builder_outreach_log(status);

-- ── 3. Builders extensions ──────────────────────────────────────────────────
alter table public.builders
  add column if not exists auto_outreach_enabled boolean default true,
  add column if not exists last_contact_at timestamptz,
  add column if not exists consecutive_no_replies int default 0,
  add column if not exists outreach_pause_reason text,
  add column if not exists outreach_paused_until timestamptz;

create index if not exists builders_outreach_due_idx
  on public.builders(active, draft, auto_outreach_enabled, last_contact_at)
  where active = true and draft = false and auto_outreach_enabled = true;

-- Backfill last_contact_at from most recent ingestion_run per builder
update public.builders b
   set last_contact_at = sub.most_recent
  from (
    select builder_id, max(email_received_at) as most_recent
      from public.ingestion_run
     where builder_id is not null and email_received_at is not null
     group by builder_id
  ) sub
 where sub.builder_id = b.id
   and b.last_contact_at is null;

-- ── 4. RLS notes ────────────────────────────────────────────────────────────
-- Service-role key bypasses RLS. Add policies here only if browser direct-reads
-- are introduced.
