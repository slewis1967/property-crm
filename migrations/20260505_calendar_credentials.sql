-- Google Calendar OAuth credentials, one row per host who can have
-- meetings scheduled on their behalf from the CRM. The flow is:
--   1. /api/auth/google/connect?host=foo@nextkey.com.au  (kicks consent)
--   2. /api/auth/google/callback                         (saves refresh_token)
--   3. /api/calendar/events POST                         (uses stored token)
--
-- We keep the refresh_token here (not in env vars) so adding a new host
-- doesn't require a Netlify deploy. Service-role-only access — the
-- supabase server client is the sole reader/writer.

create table if not exists public.calendar_credentials (
  host_email      text primary key,
  refresh_token   text not null,
  scope           text not null,
  display_name    text,
  connected_at    timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists calendar_credentials_email_idx on public.calendar_credentials(host_email);
