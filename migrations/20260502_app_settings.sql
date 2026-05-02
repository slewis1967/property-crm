-- Generic key-value app settings table.
--
-- First entry is `email_signature`. Multi-tenant rewrite later: add a
-- `tenant_id` column and a unique constraint on (tenant_id, key).

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Seed the signature row from current env-var defaults if not already present.
-- The signature module reads from this row and falls back to env if the row
-- has missing fields or the table is empty.
insert into public.app_settings (key, value, updated_by)
values (
  'email_signature',
  jsonb_build_object(
    'name',       'Sean Lewis',
    'title',      'Director, NextKey Property Strategists',
    'email',      'sean.l@nextkey.com.au',
    'phone',      '0477 007 785',
    'web',        'nextkey.com.au',
    'disclaimer', 'General advice only. NextKey Property Strategists is not a licensed financial planner, mortgage broker, real estate agent or solicitor. Always seek independent advice before making property investment decisions.'
  ),
  'system-seed'
)
on conflict (key) do nothing;
