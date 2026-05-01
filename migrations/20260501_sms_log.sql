-- SMS audit log.
-- Every outbound SMS gets a row, regardless of provider success/failure.
-- Used to (a) prove what was sent for compliance, (b) avoid double-sending,
-- (c) tie delivery failures back to the contact for cleanup.

create table if not exists public.sms_log (
  id                bigserial primary key,
  contact_id        uuid references public.contacts(id) on delete set null,
  phone             text not null,           -- E.164 formatted
  body              text not null,
  status            text not null,           -- queued | sent | failed | opted_out
  provider          text default 'clicksend',
  provider_msg_id   text,                    -- ClickSend message_id
  error             text,                    -- populated on failure
  campaign          text,                    -- e.g. 'getahome_2026_05'
  cost              numeric(10,4),           -- per-msg cost in AUD if returned
  sent_at           timestamptz default now()
);

create index if not exists sms_log_contact_id_idx on public.sms_log(contact_id);
create index if not exists sms_log_phone_idx on public.sms_log(phone);
create index if not exists sms_log_campaign_idx on public.sms_log(campaign);
create index if not exists sms_log_sent_at_idx on public.sms_log(sent_at desc);

-- Opt-out tracking. STOP replies and manual opt-outs land here.
-- Send script must left-join against this and skip any phone present.
create table if not exists public.sms_opt_outs (
  phone        text primary key,             -- E.164 formatted
  contact_id   uuid references public.contacts(id) on delete set null,
  reason       text,                         -- 'stop_reply' | 'manual' | 'bounce'
  created_at   timestamptz default now()
);

-- RLS not enabled — CRM uses service-role key server-side.
