-- Email log — outbound (and eventually inbound) email tracking.
--
-- v1 (2026-05-02) is outbound-only via Brevo. The `direction` column is in
-- place for the v2 inbound layer (Gmail OAuth → cron-poll → INSERT inbound
-- rows); same table, different direction.
--
-- contact_id is intentionally not FK'd — may reference contacts.id (live)
-- or ghl_archive_contacts.id (legacy). Both tables get queried by the email
-- history view.

create table if not exists public.email_log (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid,
  opportunity_id    text,                                    -- NEXUS lead_id or GHL archive opp id
  direction         text not null default 'outbound',        -- outbound | inbound
  to_email          text not null,
  to_name           text,
  from_email        text not null,
  from_name         text,
  cc                jsonb default '[]'::jsonb,               -- array of "name <email>" strings
  bcc               jsonb default '[]'::jsonb,
  subject           text not null,
  body_html         text,
  body_text         text,
  status            text not null default 'queued',          -- queued | sent | failed | bounced | opted_out
  brevo_message_id  text,
  error             text,
  sent_by           text,                                    -- cf-access authenticated user email
  tags              jsonb default '[]'::jsonb,
  thread_id         text,                                    -- v2: groups outbound + inbound by Message-ID family
  in_reply_to       text,                                    -- v2: parent Message-ID for replies
  created_at        timestamptz not null default now(),
  sent_at           timestamptz
);

create index if not exists email_log_contact_idx     on public.email_log(contact_id);
create index if not exists email_log_opportunity_idx on public.email_log(opportunity_id);
create index if not exists email_log_sent_at_idx     on public.email_log(sent_at desc);
create index if not exists email_log_status_idx      on public.email_log(status);
create index if not exists email_log_thread_idx      on public.email_log(thread_id);
