-- Click-to-dial from the CRM on Glenn's work phone (Moto g67, 0477 201 245).
-- The CRM can't make a handset dial, so "Phone call" on a client page writes a
-- row here and a relay with adb access to the phone (C:\Users\sean\bin\
-- workphone-dial-relay.py) claims it and starts the call on the handset.
-- Rows are a short-lived queue plus an audit of who asked to call whom.
create table if not exists phone_call_requests (
  id uuid primary key default gen_random_uuid(),
  phone text not null,                 -- E.164, validated AU number
  contact_id text,
  opportunity_id text,
  requested_by text not null,          -- CF Access email
  status text not null default 'pending'
    check (status in ('pending', 'dialing', 'failed', 'expired')),
  error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index if not exists phone_call_requests_pending_idx
  on phone_call_requests (created_at) where status = 'pending';

-- Service-role only, like every other CRM table holding contact data.
alter table phone_call_requests enable row level security;
