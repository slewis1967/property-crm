-- Paid Accounts — the register of every paid service the CRM/business runs on,
-- and the alert log that proves the daily check actually ran.
--
-- Optional: the app degrades gracefully if these tables are absent (the panel
-- shows a "run the migration" notice; the alert sweep reports skipped). Apply in
-- the Supabase SQL editor.

create table if not exists public.paid_services (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null unique,
  category              text not null default 'other',   -- ai | infrastructure | comms | marketing | domains | software | data | finance | other
  purpose               text,                            -- what it powers / what breaks if it lapses
  criticality           text not null default 'important', -- critical | important | optional
  status                text not null default 'active',  -- active | trial | paused | cancelled
  vendor_url            text,                            -- billing / console URL
  account_ref           text,                            -- login email or account id (NOT credentials)
  plan                  text,
  cost                  numeric,                         -- per billing_cycle
  currency              text not null default 'AUD',
  billing_cycle         text not null default 'monthly', -- monthly | quarterly | annual | usage | prepaid | one_off
  next_due_date         date,
  last_paid_on          date,
  auto_renew            boolean not null default true,
  payment_method        text,                            -- e.g. "Amex ••1234", "PayPal", "direct debit"
  card_expiry           text,                            -- 'YYYY-MM' — warn before the card dies mid-renewal
  balance_remaining     numeric,                         -- prepaid credit balance (OpenRouter, ClickSend, Higgsfield)
  balance_unit          text,                            -- 'AUD' | 'credits'
  low_balance_threshold numeric,
  alert_lead_days       integer not null default 7,      -- how early "due soon" fires
  snoozed_until         date,                            -- suppress alerts up to and including this date
  notes                 text,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists paid_services_next_due_idx on public.paid_services (next_due_date);
create index if not exists paid_services_status_idx on public.paid_services (status);

alter table public.paid_services enable row level security;

-- Alert log. Two uses:
--   1. `kind='run'` rows (service_id null) are the heartbeat — the panel reads the
--      latest one to show "last automated check", so a cron that silently stops
--      firing is VISIBLE instead of being mistaken for "nothing was due". This is
--      the lesson from the YLA sweep that returned 0 for weeks.
--   2. per-item rows dedupe the digest to at most one per Brisbane day.
create table if not exists public.paid_service_alerts (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid references public.paid_services (id) on delete cascade,
  kind        text not null,           -- run | overdue | due_soon | trial_ending | card_expiring | low_balance | missing_billing_date
  severity    text not null default 'info',
  message     text,
  channel     text,                    -- email | none
  dry_run     boolean not null default false,
  alert_day   date,                    -- Brisbane calendar day, for one-per-day dedupe
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists paid_service_alerts_created_idx on public.paid_service_alerts (created_at desc);
create index if not exists paid_service_alerts_run_idx on public.paid_service_alerts (kind, created_at desc);
create index if not exists paid_service_alerts_day_idx on public.paid_service_alerts (alert_day, kind);

alter table public.paid_service_alerts enable row level security;

-- ── Seed: the services we actually run on ────────────────────────────────────
-- Names, purposes and cycles are known facts. Costs and renewal dates are
-- deliberately LEFT NULL rather than guessed — a fabricated renewal date is
-- worse than no date, because it looks like a real warning. Each seeded row
-- shows up in the panel as "no renewal date recorded" until it's filled in,
-- which makes the register its own setup checklist.
insert into public.paid_services (name, category, purpose, criticality, billing_cycle, vendor_url, created_by)
values
  ('OpenRouter', 'ai', 'Every AI call in the CRM and the NEXUS agent fleet (advisor, voice, document extraction, compliance review). Prepaid credits — if the balance hits zero, all AI features stop.', 'critical', 'prepaid', 'https://openrouter.ai/credits', 'system-seed'),
  ('Supabase', 'infrastructure', 'Primary CRM database plus document/attachment storage. Everything stops without it.', 'critical', 'monthly', 'https://supabase.com/dashboard/org/_/billing', 'system-seed'),
  ('Netlify', 'infrastructure', 'Hosts crm.nextkey.com.au (Next.js runtime + functions).', 'critical', 'monthly', 'https://app.netlify.com/teams/_/billing', 'system-seed'),
  ('Fly.io', 'infrastructure', 'nextkey-nexus-api — the cron/agent fleet (lead webhook, sweeps, advisors) and the LiveKit video SFU.', 'critical', 'monthly', 'https://fly.io/dashboard/_/billing', 'system-seed'),
  ('Cloudflare', 'infrastructure', 'Cloudflare Access gate in front of the CRM, DNS, and Pages for nextkey.com.au.', 'critical', 'monthly', 'https://dash.cloudflare.com/', 'system-seed'),
  ('Brevo', 'comms', 'Transactional and sequence email — client emails, document reminders, portal notifications.', 'critical', 'monthly', 'https://app.brevo.com/billing/plan', 'system-seed'),
  ('ClickSend', 'comms', 'Outbound SMS (document reminders, voice-assistant sends). Prepaid balance.', 'important', 'prepaid', 'https://dashboard.clicksend.com/account/billing', 'system-seed'),
  ('Mailbux', 'comms', 'Business email hosting (mail.mailbux.com) for the NextKey mailboxes.', 'critical', 'monthly', 'https://mailbux.com/', 'system-seed'),
  ('Google Workspace — NextKey', 'comms', 'nextkey.com.au mail, Drive and Calendar, including the CRM calendar integration.', 'critical', 'monthly', 'https://admin.google.com/ac/billing', 'system-seed'),
  ('Google Workspace — Springboard', 'comms', 'springboardhomesapp.com seat behind the client portal''s Drive export and calendar invites.', 'important', 'monthly', 'https://admin.google.com/ac/billing', 'system-seed'),
  ('Hostinger', 'infrastructure', 'WordPress hosting for springboardhomes.com.au (and the NextKey WP migration).', 'important', 'annual', 'https://hpanel.hostinger.com/billing', 'system-seed'),
  ('Higgsfield', 'marketing', 'AI image/video generation for the Creative Studio. PLUS plan with a monthly credit allowance.', 'optional', 'monthly', 'https://higgsfield.ai/', 'system-seed'),
  ('Meta Ads — NextKey', 'marketing', 'Paid amplification for Springboard/NextKey. Spend-capped; a declined card pauses delivery.', 'important', 'usage', 'https://business.facebook.com/billing_hub', 'system-seed'),
  ('Anthropic / Claude', 'software', 'Claude Code development seat and the agent fleet tooling.', 'important', 'monthly', 'https://console.anthropic.com/settings/billing', 'system-seed'),
  ('GitHub', 'software', 'property-crm and nextkey-website repos, plus the Actions cron that drives the CRM sweeps.', 'important', 'monthly', 'https://github.com/settings/billing', 'system-seed'),
  ('Domain — nextkey.com.au', 'domains', 'Primary business domain. Expiry takes down the website, the CRM host name and all email.', 'critical', 'annual', null, 'system-seed'),
  ('Domain — springboardhomes.com.au', 'domains', 'Springboard Homes public site and lead funnel.', 'important', 'annual', null, 'system-seed'),
  ('Domain — springboardhomesapp.com', 'domains', 'Springboard Workspace / portal domain.', 'important', 'annual', null, 'system-seed')
on conflict (name) do nothing;
