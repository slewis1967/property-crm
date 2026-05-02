-- v2: inbound email support.
--
-- Adds the RFC822 Message-ID column used for cross-direction threading.
-- Outbound route populates it from Brevo's `messageId` response field
-- (which IS the RFC822 Message-ID, e.g. <abc@smtp-relay.brevo.com>).
-- Inbound poller populates it from the Gmail message's Message-Id header.

alter table public.email_log
  add column if not exists message_id text;

create index if not exists email_log_message_id_idx on public.email_log(message_id);

-- Backfill: copy existing brevo_message_id into message_id (they're the same value
-- for Brevo-sent rows, and queries can settle on message_id going forward).
update public.email_log
  set message_id = brevo_message_id
  where message_id is null and brevo_message_id is not null;
