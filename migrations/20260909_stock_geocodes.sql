-- Geocode cache for the Stock Map (/properties/map).
--
-- global_stock_pool carries no coordinates, and only ~4% of active rows have a
-- street address — so the map plots one bubble per SUBURB. That means we only
-- ever need ~170 lookups, and they change about as often as Australia gains a
-- new suburb. Caching them here keeps the map instant and keeps us well inside
-- Nominatim's usage policy (we geocode a suburb once, ever).
--
-- Optional: /api/properties/map degrades gracefully if this table is absent —
-- it returns every suburb as "unlocated" with a note to run the migration,
-- rather than erroring. Apply in the Supabase SQL editor when ready.

create table if not exists stock_geocodes (
  -- normalised cache key: "SUBURB|STATE" upper-cased and whitespace-collapsed
  key         text primary key,
  suburb      text not null,
  state       text,
  lat         double precision,
  lng         double precision,
  -- 'suburb' — the centroid granularity we plot at. Reserved for a future
  -- 'address' tier for the minority of rows that carry a street address.
  precision   text not null default 'suburb',
  provider    text not null default 'nominatim',
  display     text,
  -- A miss is cached too, so a suburb Nominatim can't resolve (typo, estate
  -- name in the suburb column) isn't re-queried on every page load. Clear the
  -- row to force a retry after fixing the source data.
  failed      boolean not null default false,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists stock_geocodes_failed_idx on stock_geocodes (failed);

-- RLS: server routes use the service key (bypasses RLS). Enable + default-deny
-- so the browser anon key can't read the cache directly.
alter table stock_geocodes enable row level security;
