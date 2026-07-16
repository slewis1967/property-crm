-- Video call telemetry (self-hosted LiveKit).
-- The LiveKit SFU POSTs lifecycle events to /api/livekit/webhook, which
-- appends a row here. Used to (a) show calls on a contact's timeline, (b) tie
-- a recording back to the contact, (c) prove a call happened for compliance.
--
-- Append-only: the webhook never updates or deletes. One row per LiveKit event
-- (room_started, participant_joined, participant_left, room_finished,
-- egress_started, egress_ended, ...).

create table if not exists public.video_call_events (
  id                    bigserial primary key,
  event                 text not null,           -- LiveKit event name
  room                  text,                    -- e.g. 'contact-<uuid>'
  contact_id            uuid references public.contacts(id) on delete set null,
  participant_identity  text,                    -- CRM email of the participant
  participant_name      text,                    -- display name in the call
  num_participants      integer,                 -- room size at event time
  egress_id             text,                    -- recording/egress job id
  recording_url         text,                    -- location of the recording file
  raw                   jsonb,                   -- full event payload for audit
  created_at            timestamptz default now()
);

create index if not exists video_call_events_contact_id_idx
  on public.video_call_events(contact_id);
create index if not exists video_call_events_room_idx
  on public.video_call_events(room);
create index if not exists video_call_events_created_at_idx
  on public.video_call_events(created_at desc);

-- RLS not enabled — CRM uses the service-role key server-side (same as sms_log,
-- appointments, etc). Re-introduce RLS only if a browser client reads this.
