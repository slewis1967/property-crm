-- Property financial overrides for aggregator stock
-- Durable store keyed by global_stock_pool.id for fields not present in the feed
-- (e.g. gross_developer_fee for PropChannel OS sync)
--
-- Safe to run multiple times (IF NOT EXISTS guards).

create table if not exists public.property_financials (
  property_id uuid primary key references public.global_stock_pool(id) on delete cascade,
  gross_developer_fee numeric, -- absolute amount in AUD; NULL means unknown/not set
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Updated-at trigger (local function, namespaced to avoid clashes)
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'propfin_set_updated_at'
  ) then
    create function public.propfin_set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end $$;

drop trigger if exists trg_propfin_updated_at on public.property_financials;
create trigger trg_propfin_updated_at
before update on public.property_financials
for each row
execute function public.propfin_set_updated_at();

comment on table public.property_financials is
  'Per-property financial overrides keyed by global_stock_pool.id (e.g. gross_developer_fee for PropChannel sync)';
comment on column public.property_financials.gross_developer_fee is
  'Gross developer fee (AUD) used for PropChannel OS fee-split trigger';

