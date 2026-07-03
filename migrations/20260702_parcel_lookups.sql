-- Cache of authoritative site lookups (parcel + planning controls + overlays)
-- resolved from state government spatial services by utils/planning.
--
-- Optional: the app degrades gracefully if this table is absent (resolveSite
-- simply skips the cache and re-queries the government services each time).
-- Apply in the Supabase SQL editor when ready.

create table if not exists parcel_lookups (
  id           uuid primary key default gen_random_uuid(),
  -- normalised address (lower/trimmed) used as the cache key
  address_key  text not null,
  address      text not null,
  state        text,
  lng          double precision,
  lat          double precision,
  parcel       jsonb,   -- { lot, plan, lotPlan, areaSqm, areaEstimated, lga, locality, geometry }
  controls     jsonb,   -- { zoneCode, zoneDescription, heightLimitM, fsr, minLotSizeSqm, instrument }
  overlays     jsonb,   -- [ { kind, label, detail } ]
  sources      jsonb,   -- [ { name, url } ]
  coverage     text,    -- full | partial | none
  notes        jsonb,   -- [ string ]
  created_at   timestamptz not null default now()
);

create index if not exists parcel_lookups_address_key_idx on parcel_lookups (address_key);
create index if not exists parcel_lookups_created_at_idx on parcel_lookups (created_at desc);

-- RLS: server routes use the service key (bypasses RLS). Enable + default-deny
-- so the browser anon key can't read cached lookups directly.
alter table parcel_lookups enable row level security;
