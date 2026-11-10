-- appointments — bookings surfaced on /appointments, contact detail, and the
-- opportunity Appointments panel.
--
-- This table predates the repo: it was originally provisioned out-of-band and
-- fed by external Cal.com infrastructure (hence cal_uid / event_slug, which the
-- CRM's own scheduler never populates). Nothing in this repo created it, so a
-- fresh Supabase project would 500 on the insert in /api/appointments.
--
-- Written to be safe to run against the existing production table: every
-- statement is guarded, so this only fills in what is missing and never drops
-- or rewrites a column that already holds data.

create extension if not exists pgcrypto;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid()
);

alter table public.appointments
  -- Identity from the external Cal.com feed. Null for CRM-created bookings.
  add column if not exists cal_uid            text,
  add column if not exists event_slug         text,

  -- Two title columns exist because reads are split across both conventions:
  -- title is used by /appointments + contact/opportunity pages,
  -- event_title by OpportunityAppointments. /api/appointments writes both.
  add column if not exists title              text,
  add column if not exists event_title        text,

  add column if not exists contact_id         uuid,
  add column if not exists contact_email      text,
  add column if not exists contact_name       text,

  add column if not exists host_email         text,
  add column if not exists host_name          text,

  add column if not exists start_time         timestamptz,
  add column if not exists end_time           timestamptz,

  add column if not exists location           text,

  -- Likewise doubled: status is queried by /appointments and the dashboard
  -- brief, appointment_status by the contact panels.
  add column if not exists status             text,
  add column if not exists appointment_status text,

  add column if not exists cancel_reason      text,
  add column if not exists additional_notes   text,
  add column if not exists notes              text,

  -- Google Calendar event id, so a CRM row can be traced back to the invite.
  add column if not exists calendar_id        text,

  add column if not exists created_at         timestamptz default now(),
  add column if not exists updated_at         timestamptz default now();

-- /appointments orders and filters on start_time in every query.
create index if not exists appointments_start_time_idx
  on public.appointments (start_time desc);

-- The opportunity panel joins by email; the contact page by id then email.
create index if not exists appointments_contact_email_idx
  on public.appointments (lower(contact_email));

create index if not exists appointments_contact_id_idx
  on public.appointments (contact_id);

-- Cal.com bookings are deduped on cal_uid. Partial so the many CRM-created
-- rows (cal_uid null) don't collide with each other.
create unique index if not exists appointments_cal_uid_key
  on public.appointments (cal_uid)
  where cal_uid is not null;

-- Service-role only, consistent with the rest of the schema: every read goes
-- through a server route using SUPABASE_SERVICE_KEY, never the anon client.
alter table public.appointments enable row level security;
