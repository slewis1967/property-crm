-- Recurring monthly operating costs (salaries, ad spend, infra, subscriptions…)
-- so the cash-flow forecast can net deal revenue down to net profit.

create table if not exists revenue_costs (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,
  monthly_amount numeric not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
