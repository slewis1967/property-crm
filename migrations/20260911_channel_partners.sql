-- Channel Partners — firms we are recruiting to take NextKey-sourced stock
-- (and, where they serve home buyers, to refer to Springboard). Backs
-- /channel-partners. Seeded from channel_recruitment_targets.csv (24 firms,
-- researched 2026-09-11).
--
-- Additive and idempotent: `create table if not exists`, and the seed only
-- inserts a company that isn't already there, so re-running it never
-- duplicates a row or overwrites an edit made in the panel.

create table if not exists channel_partners (
  id                  uuid primary key default gen_random_uuid(),
  company             text not null,
  channel_type        text,
  -- Free text as researched ("Springboard / Core investor"); the panel maps
  -- it to stream keys with parseStreams() in utils/channel-partners.ts.
  nextkey_stream_fit  text,
  stock_focus         text,
  supply_model        text,
  suggested_priority  text check (suggested_priority is null or suggested_priority in ('A','B','C')),
  priority_reason     text,
  contact_name        text,
  contact_role        text,
  email               text,
  phone               text,
  location            text,
  website             text,
  source_url          text,
  verification_notes  text,
  licence_verified    text,
  status              text not null default 'Not contacted',
  next_action         text,
  -- A Brisbane calendar date, not an instant: "contacted on the 11th".
  last_contacted      date,
  notes               text,
  -- Stamped when a pitch is sent from the panel. The email itself lives in
  -- email_log, tagged 'channel-partner'.
  pitch_sent_at       timestamptz,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Contact freshness. The research that seeded this table came off web pages,
-- and web pages go stale. `contact_verified_at` is when a human (or a check
-- that found every detail unchanged on the firm's own site) last confirmed the
-- details; the panel won't send a pitch on details older than 90 days without
-- an explicit override. `contact_check` holds the latest check's evidence and
-- proposals (see utils/channel-partner-contacts.ts) — proposals are never
-- applied automatically.
alter table channel_partners add column if not exists contact_verified_at     timestamptz;
alter table channel_partners add column if not exists contact_verified_by     text;
alter table channel_partners add column if not exists contact_verified_method text;
alter table channel_partners add column if not exists contact_check           jsonb;
alter table channel_partners add column if not exists contact_checked_at      timestamptz;

create index if not exists channel_partners_status_idx on channel_partners (status);
create index if not exists channel_partners_priority_idx on channel_partners (suggested_priority);
create index if not exists channel_partners_checked_idx on channel_partners (contact_checked_at nulls first);

-- RLS on, zero policies: the routes use the service key. Without it the
-- browser-shipped anon key could read the table straight through PostgREST,
-- around the Cloudflare Access gate.
alter table channel_partners enable row level security;

insert into channel_partners (company, channel_type, nextkey_stream_fit, stock_focus, supply_model, suggested_priority, priority_reason, contact_name, contact_role, email, phone, location, website, source_url, verification_notes, licence_verified, status, next_action, notes)
select v.* from (values
  ('Property Club', 'Investor club / education', 'Core investor', 'Investor stock via member sourcing', 'Independent club (members)', 'A', 'Large member base, founded 1994; one agreement reaches many buyers', 'Kevin Young', 'Founder', null, null, 'Eight Mile Plains QLD', 'https://www.propertyclub.com.au', 'https://en.wikipedia.org/wiki/Property_Club', 'Contact details not captured - enrich', null, 'Not contacted', 'Find partnerships/property sourcing contact', null),
  ('PRG Property Investments', 'Property marketer', 'Core investor', 'New houses, townhouses, villas; turnkey H&L', 'Independent, multi-builder, national', 'A', 'Markets other builders'' stock nationally since 1993', 'Michael Grace', 'Founder', 'mike@prgwa.com', '0412 920 747', 'Rockingham WA', 'https://www.prgpi.com', 'https://www.prgpi.com/', null, null, 'Not contacted', 'Intro call + send stock sample', null),
  ('Gold Property Partners', 'Building broker', 'Springboard / Core investor', 'H&L, duplex, custom builds, investors', 'Independent, builder-paid', 'A', 'Explicitly builder-paid; FHB + investor mix suits Springboard', 'Tim Gold', 'Managing Director', 'build@goldpp.com.au', '07 5438 9775', 'Birtinya QLD', 'https://goldpropertypartners.com.au', 'https://goldpropertypartners.com.au/', 'Email decoded from site''s spam-protected link - confirm; Kelly Gold also listed as Director', null, 'Not contacted', 'Intro call to Tim Gold', null),
  ('Buy Build Invest Homes', 'Building broker', 'Springboard', 'H&L packages for home buyers and investors', 'Independent, builder-partner model', 'A', 'Free-to-client broker model; Springboard fit', null, null, null, '0421 412 141', null, 'https://www.buybuildinvesthomes.com.au', 'https://www.buybuildinvesthomes.com.au/our-services', null, null, 'Not contacted', 'Intro call', null),
  ('Investor Group', 'Investment advisory', 'Core investor', 'New H&L, turnkey', 'Independent', 'A', 'Sources and oversees new H&L for clients', null, null, null, '1300 38 66 34', null, 'https://www.investorgroup.com.au', 'https://www.investorgroup.com.au/professional-services/property-investment-services/', null, null, 'Not contacted', 'Intro call', null),
  ('Aus Investment Properties', 'Property marketer', 'Core investor / SMSF / multi-tenancy', 'Turnkey, co-living, SMSF', 'Independent (states buy direct from builder)', 'A', 'Broad investor product range incl. SMSF', null, null, 'info@ausinvestmentproperties.com.au', '1300 268 947', null, 'https://ausinvestmentproperties.com.au', 'https://ausinvestmentproperties.com.au/properties/type/co-living', null, null, 'Not contacted', 'Email intro + stocklist', null),
  ('properT network', 'SMSF / SDA consultant', 'SMSF / SDA', 'Single-contract SMSF, SDA', 'Independent consultant', 'A', 'Covers two NextKey streams (SMSF + SDA); critical of poor-location SDA - lead with demand data', 'Stephen Lazar', 'Principal', null, '+61 413 108 125', null, 'https://ndisproperty.net.au', 'https://ndisproperty.net.au/', null, null, 'Not contacted', 'Call with SDA demand evidence', null),
  ('Superannuation Smart Property', 'SMSF specialist', 'SMSF', 'Single-part contract H&L, dual key, duplex, rooming, NDIS', 'Independent, uses single-contract facilitator', 'A', 'Needs single-contract-ready stock', 'Lisa Thomas / Tayla Thomas', 'Founders', null, null, null, 'https://superannuationsmartproperty.com.au', 'https://superannuationsmartproperty.com.au/', 'Contact details not captured - enrich', null, 'Not contacted', 'Confirm single-contract capability then intro', null),
  ('NDIS Property Australia', 'SDA consultancy', 'SDA', 'SDA H&L packages, STA/MTA/SIL', 'Partners with builders, developers, SDA providers', 'A', 'Direct SDA channel that sources from builders/developers', 'Deb / Minh', 'Principals (first names only published)', null, null, 'Melbourne VIC', 'https://www.ndispropertyaustralia.com.au', 'https://ndis.property/', 'Surnames not published - enrich via LinkedIn', null, 'Not contacted', 'Intro re SDA stock', null),
  ('CoLiving Homes', 'Multi-tenancy marketer', 'Multi-tenancy', 'Co-living, rooming, dual key, duplex', 'Independent', 'A', 'Specialist multi-tenancy channel, national', null, null, null, '1300 059 744', 'Melbourne VIC', 'https://colivinghomes.au', 'https://colivinghomes.au/', null, null, 'Not contacted', 'Intro call', null),
  ('Brix & Mortar Property Group', 'Multi-tenancy marketer', 'Multi-tenancy', 'Co-living, rooming houses', 'Independent with builder partnerships', 'A', 'Uses specialist builder partners', null, null, 'info@brixandmortarpg.com.au', '1800 948 010', 'Melbourne VIC', 'https://brixandmortarpg.com.au', 'https://brixandmortarpg.com.au/co-living-investment/', null, null, 'Not contacted', 'Email intro', null),
  ('Simply Wealth Group', 'Investment advisory', 'Core investor / SMSF', 'H&L, SMSF', 'Independent', 'B', 'Melbourne-focused; check interest in QLD stock', null, null, null, null, 'Melbourne VIC', 'https://simplywealthgroup.com.au', 'https://simplywealthgroup.com.au/house-and-land-packages-in-melbourne/', 'Contact details not captured - enrich', null, 'Not contacted', 'Enrich contact', null),
  ('TPG Property Group', 'Property advisory', 'Springboard / Core investor', 'Land, finance, turnkey builds, co-living', 'Independent', 'B', 'FHB + investor mix', null, null, null, null, 'Melbourne VIC', 'https://tpggroup.com.au', 'https://tpggroup.com.au/blogs/investing-in-co-living-properties-an-exclusive-chance-for-investors', 'Contact details not captured - enrich', null, 'Not contacted', 'Enrich contact', null),
  ('Key Property Investments Group', 'Property marketer', 'Core investor', 'Dual key H&L', 'Independent', 'B', 'Page is older - confirm active', null, null, null, null, null, 'https://keypropertyinvestments.com.au', 'https://keypropertyinvestments.com.au/our-services/dual-key-homes/', 'Contact details not captured - enrich', null, 'Not contacted', 'Verify active', null),
  ('Real Property Advice', 'Property advisory', 'Core investor', 'Investor H&L, development', 'Independent', 'B', null, null, null, null, null, null, 'https://propertyadvice.com.au', 'https://propertyadvice.com.au/', 'Contact details not captured - enrich', null, 'Not contacted', 'Enrich contact', null),
  ('SMSF Properties', 'SMSF specialist', 'SMSF', 'Off-the-plan converted to 1-part contracts', 'Own compliant structure; curated portfolio', 'B', 'May prefer to source directly; test with single-contract stock', null, null, null, null, null, 'https://smsfproperties.com.au', 'https://smsfproperties.com.au/', 'Contact details not captured - enrich', null, 'Not contacted', 'Enrich contact', null),
  ('Positive Income Properties', 'Multi-tenancy marketer', 'Multi-tenancy', 'Co-living with rental guarantee', 'Unclear - may use own product', 'B', 'Confirm whether they take third-party stock', null, null, null, null, null, 'https://www.positiveincomeproperties.com', 'https://www.positiveincomeproperties.com/co-living-shared-living-investment-properties/', 'Contact details not captured - enrich', null, 'Not contacted', 'Qualify supply model', null),
  ('The Harmony Group', 'Multi-tenancy specialist', 'Multi-tenancy', 'Purpose-built 1B co-living', 'Unclear - may be own product', 'B', 'Confirm whether they take third-party stock', null, null, null, null, null, 'https://theharmonygroup.com.au', 'https://theharmonygroup.com.au/', 'Contact details not captured - enrich', null, 'Not contacted', 'Qualify supply model', null),
  ('House and Land Solutions', 'Boutique agency', 'Springboard', 'H&L packages QLD', 'Independent licensed agency', 'B', 'Site is old - confirm still trading', 'Micki Holder', 'Principal (licensed agent)', null, '0412 955 006', 'QLD', 'https://www.houseandlandsolutions.com.au', 'https://www.houseandlandsolutions.com.au/', null, null, 'Not contacted', 'Verify active', null),
  ('Dual Dwelling Investments', 'Dual occupancy specialist', 'Multi-tenancy', 'Dual occ / granny flats, off-market', 'Leans established + add granny flat', 'C', 'Model centres on existing homes; lower fit for new stock', null, null, null, null, 'QLD', 'https://dualdwellinginvestments.com.au', 'https://dualdwellinginvestments.com.au/dual-occupancy-investment-property-queensland/', 'Contact details not captured - enrich', null, 'Not contacted', 'Low priority', null),
  ('SDA Housing Investments', 'SDA provider/builder', 'SDA', 'SDA builds all categories', 'Vertically integrated (builds own SDA)', 'C', 'Builds its own stock - more competitor than channel; has broker network', 'Barry Rice', 'Director', 'info@sdahousinginvestments.com.au', '1300 052 080', 'QLD', 'https://www.sdahousinginvestments.com.au', 'https://www.sdahousinginvestments.com.au/about-us', null, null, 'Not contacted', 'Explore only if seeking SDA stock/partnership', null),
  ('Meridien Invest', 'SDA marketer', 'SDA', 'SDA packages incl. studios', 'Unclear - part of Meridien Group', 'C', 'Confirm whether they take third-party stock', null, null, null, '1300 964 811', 'QLD', 'https://www.meridieninvest.com.au', 'https://www.meridieninvest.com.au/ndis-packages-for-sale', 'Holds QLD real estate licence (per site)', null, 'Not contacted', 'Qualify supply model', null),
  ('Philips Group', 'SDA marketer', 'SDA', 'NDIS/SDA investment', 'Unknown', 'C', 'Limited info', null, null, null, null, null, 'https://philipsgroup.com.au', 'https://philipsgroup.com.au/ndis-investment-properties/', 'Contact details not captured - enrich', null, 'Not contacted', 'Research', null),
  ('Property Friends', 'SDA marketer', 'SDA', 'SDA investment', 'Unknown', 'C', 'Limited info', null, null, null, null, null, 'https://propertyfriends.com.au', 'https://propertyfriends.com.au/invest-in-sda-property/', 'Contact details not captured - enrich', null, 'Not contacted', 'Research', null)
) as v(company, channel_type, nextkey_stream_fit, stock_focus, supply_model, suggested_priority, priority_reason, contact_name, contact_role, email, phone, location, website, source_url, verification_notes, licence_verified, status, next_action, notes)
where not exists (select 1 from channel_partners c where lower(c.company) = lower(v.company));
