-- deal_packets — the contract between NEXUS extraction and CRM report generation.
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS guards).
-- Spec: docs/FEATURE-deal-analyser.md · JSON shape: utils/deal-packet.ts

create table if not exists deal_packets (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  text,                                    -- NEXUS lead id (opportunities live in NEXUS)
  source_email_id uuid references email_log(id),           -- the inbound package email
  status          text not null default 'extracting',      -- extracting | needs_rent_input | ready | reports_generated | failed
  property_count  int,
  packet          jsonb not null default '{}'::jsonb,       -- the verified DealPacket (see utils/deal-packet.ts)
  redactions      jsonb default '[]'::jsonb,                -- internal figures stripped (e.g. commission) — never client-facing
  created_by      text,                                     -- CF-Access user who forwarded / triggered
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists deal_packets_opportunity_idx on deal_packets (opportunity_id);
create index if not exists deal_packets_status_idx       on deal_packets (status);

-- Keep updated_at fresh on every change.
create or replace function set_deal_packets_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deal_packets_set_updated_at on deal_packets;
create trigger deal_packets_set_updated_at
  before update on deal_packets
  for each row execute function set_deal_packets_updated_at();

-- Match the rest of the schema's posture: RLS on, default-deny. The browser
-- anon key reads nothing; server components / NEXUS use the service key
-- (utils/supabase.ts) which bypasses RLS. Add policies only if a browser
-- client ever needs direct access.
alter table deal_packets enable row level security;
