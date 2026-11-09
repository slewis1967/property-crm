-- Prospect builders - stock suppliers (builders, developers, aggregators,
-- project marketers) we want a marketing agreement with, before they send us
-- stock. Lives as a section on /aggregator/builders.
--
-- Pipeline: prospect -> agreement_requested -> agreement_signed -> onboarded.
--
-- Onboarding is the hand-off to the stock side: it creates (or links) an active
-- row in `builders` carrying the firm's email domains, which is how
-- nextkey_aggregator.resolve_builder() attributes inbound stocklists. From
-- then on the firm is managed in the Builders list; the prospect row stays as
-- the record of when the agreement was requested and signed, and by whom.
--
-- Access is service-role only (RLS on, zero policies).

CREATE TABLE IF NOT EXISTS prospect_builders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company                 text NOT NULL UNIQUE,
  category                text,
  location                text,
  website                 text,
  signup_method           text,
  stock_types             text,
  commission_notes        text,
  verification_notes      text,
  source_url              text,
  next_action             text,
  notes                   text,

  -- [{ name, role, email, phone, phone_alt, notes }]
  contacts                jsonb NOT NULL DEFAULT '[]'::jsonb,

  status                  text NOT NULL DEFAULT 'prospect'
                            CHECK (status IN ('prospect','agreement_requested','agreement_signed','onboarded')),
  agreement_requested_at  timestamptz,
  agreement_requested_by  text,
  agreement_signed_at     timestamptz,
  agreement_signed_by     text,
  onboarded_at            timestamptz,
  onboarded_by            text,
  builder_id              uuid REFERENCES builders(id) ON DELETE SET NULL,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospect_builders_status_idx ON prospect_builders (status);

ALTER TABLE prospect_builders ENABLE ROW LEVEL SECURITY;

-- Seed: D:\Downloads\channel_partner_contacts.csv (14 Sep 2026), one row per
-- company, CSV contact rows folded into `contacts`.
INSERT INTO prospect_builders
  (company, category, location, website, signup_method, stock_types, commission_notes,
   verification_notes, source_url, next_action, notes, contacts)
VALUES
  ('Property Wealth Queensland (PWQ)', 'Aggregator', 'QLD (stock QLD/NSW/SA)', 'https://www.propertywealthqueensland.com.au', 'Apply via contact page', 'Single-contract, H&L, townhomes, apartments, NDIS, co-living', '6,000+ active channel partners', 'Email domain differs from website domain - as published on site', 'https://www.propertywealthqueensland.com.au/channel-partners/', 'Request marketing agreement + stocklist', NULL, '[{"name":"Simone Cullen","role":"Founder","email":"simone@propertywealthqld.com.au","phone":"0429 854 196","phone_alt":null,"notes":null}]'::jsonb),
  ('Investhub', 'Aggregator (wholesale)', 'South Perth WA (national stock)', 'https://investhub.net.au', 'Book discovery call / email', 'H&L, dual key, SMSF single contract', 'Structured commissions; dedicated account manager after onboarding; white-label available', 'Email decoded from site''s spam-protected links - confirm on first contact', 'https://investhub.net.au/', 'Book discovery call', NULL, '[{"name":null,"role":"Managing Director (unnamed)","email":"admin@investhub.net.au","phone":"08 9343 4505","phone_alt":"0431 303 801","notes":null}]'::jsonb),
  ('The Property Room', 'Aggregator (wholesale)', 'Gold Coast QLD', 'https://www.thepropertyroom.com.au', 'Request marketing agreement', 'Duplex, dual occ, rooming, co-living, NDIS, SMSF one-part contracts', 'Weekly stocklists and deal alerts to partners', NULL, 'https://www.thepropertyroom.com.au/contactus', 'Request marketing agreement', NULL, '[{"name":null,"role":null,"email":"contact@thepropertyroom.com.au","phone":"0426 192 099","phone_alt":null,"notes":null}]'::jsonb),
  ('ALC Projects', 'Aggregator / developer', 'Surfers Paradise QLD (SEQ, northern NSW, Melbourne, Adelaide)', 'https://alcprojects.com.au', 'Web form only (name, email, business name, ACN, registered address)', 'H&L, co-living', NULL, 'No email or phone published', 'https://alcprojects.com.au/channel-partners/', 'Submit channel partner form', NULL, '[]'::jsonb),
  ('Smartlisting', 'Aggregator / project marketer', 'Hawthorn East VIC', 'https://smartlisting.com.au', 'Apply via contact page', 'Melbourne apartments/townhouses', 'Dedicated account manager for approved partners', 'Site has injected casino spam links - possibly compromised; extra due diligence', 'https://smartlisting.com.au/channel-partners/', 'Apply as channel partner', NULL, '[{"name":null,"role":null,"email":"info@smartlisting.com.au","phone":"1300 870 750","phone_alt":null,"notes":null}]'::jsonb),
  ('Asia Pacific Wealth Property Group', 'Aggregator', 'QLD', 'https://www.investmentpropertyinaustralia.com.au', 'Affiliates tab on website', 'H&L, apartments, townhouses, dual dwellings, SMSF', 'Affiliate link model', 'From older LinkedIn post - confirm still active', 'https://www.linkedin.com/pulse/we-australias-no1-property-aggregator-bill-singh', 'Verify contact still current', NULL, '[{"name":"Bill Singh","role":null,"email":null,"phone":"07 3040 6290","phone_alt":"0401 682 456","notes":null}]'::jsonb),
  ('FRD Homes', 'Wholesale builder', 'QLD', 'https://frdhomes.com.au', 'Email / phone', 'Turnkey H&L', 'States wholesale builders typically pay referral partners $30k-$40k per contract', NULL, 'https://frdhomes.com.au/channel-partners/', 'Request channel agreement + commission schedule', NULL, '[{"name":null,"role":null,"email":"hello@frdhomes.com.au","phone":"07 5512 4188","phone_alt":null,"notes":null}]'::jsonb),
  ('ABN Wholesale (ABN Group)', 'Wholesale builder', 'Perth WA (national)', 'https://www.abngroup.com.au/wholesale/', 'Web form only', 'Build-to-rent, turnkey H&L, turnkey single contract', 'Live construction tracking for partners; 6-month price hold', 'No direct contact published; find BDM on LinkedIn', 'https://www.abngroup.com.au/wholesale/', 'Submit form + LinkedIn search for BDM', NULL, '[{"name":null,"role":"Land & Wholesale Manager (unnamed)","email":null,"phone":null,"phone_alt":null,"notes":null}]'::jsonb),
  ('Thomas Paul Constructions - QLD', 'Wholesale builder', 'Bundall QLD', 'https://thomaspaulconstructions.com', 'Request member portal access', 'H&L, dual key, duplex, fixed-price turnkey', 'BDM details released via partner portal', 'Site also lists admin@tpcaqld.com.au - call to confirm correct email', 'https://thomaspaulconstructions.com/', 'Call to request portal access', NULL, '[{"name":null,"role":null,"email":"admin@tpcqld.com.au","phone":"07 5555 5757","phone_alt":null,"notes":null}]'::jsonb),
  ('Thomas Paul Constructions - NSW', 'Wholesale builder', 'Tuggerah NSW', 'https://thomaspaulconstructions.com', 'Request member portal access', 'H&L, dual key, duplex, fixed-price turnkey', 'BDM details released via partner portal', NULL, 'https://thomaspaulconstructions.com/', 'Only if NSW stock needed', NULL, '[{"name":null,"role":null,"email":"admin@tpca.com.au","phone":"02 4352 4700","phone_alt":null,"notes":null}]'::jsonb),
  ('RPM Group QLD', 'Project marketer', 'Newstead QLD', 'https://www.rpmgrp.com.au', 'Enquiry form / LinkedIn', 'Land, H&L, townhomes, apartments (6,000+ lot pipeline)', 'Runs channel sales alongside retail', NULL, 'https://www.rpmgrp.com.au/our-locations/queensland/', 'LinkedIn connect + intro', NULL, '[{"name":"Clinton Trezise","role":"Managing Director QLD & NSW","email":null,"phone":"+61 3 9862 9555","phone_alt":null,"notes":"Phone listed is Melbourne head office; LinkedIn: linkedin.com/in/clinton-trezise-1924a4101"},{"name":"Peter Neale","role":"Managing Director QLD & NSW","email":null,"phone":"+61 3 9862 9555","phone_alt":null,"notes":"LinkedIn: linkedin.com/in/peter-neale-65ab2663"},{"name":"Jasmin McDougall","role":"Project Marketing Manager QLD & NSW","email":null,"phone":"+61 3 9862 9555","phone_alt":null,"notes":"LinkedIn: linkedin.com/in/jasmin-mcdougall-6a61b3147"}]'::jsonb),
  ('Land Marketing QLD', 'Project marketer', 'Keperra QLD', 'http://www.landmarketingqld.com.au', 'Email / phone', 'SEQ land and estates', 'Works with external sales channels', 'From older page - verify before relying on it', 'http://www.homemarketingqld.com.au/about-us/', 'Verify contact still current', NULL, '[{"name":"Michael Starr","role":"Managing Director","email":"michaelstarr@landmarketingQLD.com.au","phone":"(07) 3311 7064","phone_alt":null,"notes":null}]'::jsonb),
  ('SDA Homelander', 'SDA provider', 'National', 'https://channelagent.com.au', 'Online application (manual approval, credentials required)', 'SDA stock with pre-matched tenants', 'Advertises $44,000 inc GST per development, paid in two stages', 'No phone/email found; Facebook: facebook.com/HomelanderSDA; LinkedIn: linkedin.com/company/homelander. Not the Nigerian ''Homelander'' app', 'https://channelagent.com.au/', 'Apply online / message via LinkedIn', NULL, '[]'::jsonb)
ON CONFLICT (company) DO NOTHING;
