-- Revenue / deal-commission tracker. One row per deal (property lot), with the
-- remuneration NextKey earns, the referrer split, and the payment schedule as a
-- JSONB array so a deal can carry any number of instalments. Replaces the
-- static "NEXTKEY CASHFLOW PROJECTIONS" spreadsheet.

create table if not exists revenue_deals (
  id            uuid primary key default gen_random_uuid(),
  lot           text not null,                    -- address / lot label, e.g. "Lot 16 Commercial Townsville"
  purchaser     text,                             -- buyer, e.g. "Client SMSF", "Farnsworth"
  remuneration  numeric not null default 0,       -- gross fee to NextKey for the deal
  referrer_fee  numeric not null default 0,       -- portion paid out to a referrer
  referrer_note text,                             -- e.g. "to Glenn"
  payments      jsonb not null default '[]',      -- [{ label, date (YYYY-MM-DD|null), amount, paid }]
  stage         text not null default 'active',   -- active | settled | lost
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists revenue_deals_created_idx on revenue_deals (created_at desc);
create index if not exists revenue_deals_stage_idx   on revenue_deals (stage);
