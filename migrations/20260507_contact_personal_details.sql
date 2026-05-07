-- Personal / employment / financial details on contacts. These flow
-- through to opportunities at creation time so the borrowing-capacity
-- calculator (and the AI matchmaker) has real data to work with.
--
-- Mirror migration on the DuckDB side (property_leads) lives in
-- nexus_api.py _bootstrap_schema().

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS marital_status TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dependents_count INTEGER;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS home_address_street   TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS home_address_suburb   TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS home_address_state    TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS home_address_postcode TEXT;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS employment_type TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS employer_name   TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS occupation      TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS annual_income           NUMERIC;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS partner_annual_income   NUMERIC;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS existing_savings        NUMERIC;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS hecs_balance            NUMERIC;
