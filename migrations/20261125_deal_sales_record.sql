BEGIN;

ALTER TABLE partner_enquiries ALTER COLUMN partner_id  DROP NOT NULL;
ALTER TABLE partner_enquiries ALTER COLUMN client_id   DROP NOT NULL;
ALTER TABLE partner_enquiries ALTER COLUMN property_id DROP NOT NULL;

ALTER TABLE partner_enquiries DROP CONSTRAINT IF EXISTS partner_enquiries_partner_or_direct;
ALTER TABLE partner_enquiries ADD CONSTRAINT partner_enquiries_partner_or_direct
  CHECK ((partner_id IS NULL AND client_id IS NULL) OR (partner_id IS NOT NULL AND client_id IS NOT NULL));

ALTER TABLE partner_enquiries DROP CONSTRAINT IF EXISTS partner_enquiries_stage_check;
ALTER TABLE partner_enquiries ADD CONSTRAINT partner_enquiries_stage_check
  CHECK (stage IN ('requested','hold','eoi','contract_issued','unconditional','settled',
                   'declined','released','withdrawn'));

DROP INDEX IF EXISTS partner_enquiries_one_active_hold;
CREATE UNIQUE INDEX partner_enquiries_one_active_hold
  ON partner_enquiries (property_id)
  WHERE stage IN ('hold','eoi','contract_issued','unconditional') AND property_id IS NOT NULL;

DROP INDEX IF EXISTS partner_enquiries_one_open_per_client_lot;
CREATE UNIQUE INDEX partner_enquiries_one_open_per_client_lot
  ON partner_enquiries (partner_id, client_id, property_id)
  WHERE stage IN ('requested','hold','eoi','contract_issued','unconditional');

ALTER TABLE partner_enquiries
  ADD COLUMN IF NOT EXISTS sale_ref                      text,
  ADD COLUMN IF NOT EXISTS project_name                  text,
  ADD COLUMN IF NOT EXISTS developer_name                text,
  ADD COLUMN IF NOT EXISTS unit_no                       text,
  ADD COLUMN IF NOT EXISTS colour_selection              text,
  ADD COLUMN IF NOT EXISTS sale_owner                    text,
  ADD COLUMN IF NOT EXISTS contact_id                    text,
  ADD COLUMN IF NOT EXISTS buyer_names                   text,
  ADD COLUMN IF NOT EXISTS buyer_email                   text,
  ADD COLUMN IF NOT EXISTS buyer_phone                   text,
  ADD COLUMN IF NOT EXISTS buyer_address                 text,
  ADD COLUMN IF NOT EXISTS buyer_solicitor               text,
  ADD COLUMN IF NOT EXISTS buyer_broker                  text,
  ADD COLUMN IF NOT EXISTS guarantor                     text,
  ADD COLUMN IF NOT EXISTS firb_required                 boolean,
  ADD COLUMN IF NOT EXISTS lead_source                   text,
  ADD COLUMN IF NOT EXISTS conditions                    text,
  ADD COLUMN IF NOT EXISTS clause_amendments             text,
  ADD COLUMN IF NOT EXISTS sale_price                    numeric(12,2),
  ADD COLUMN IF NOT EXISTS anticipated_exchange_date     date,
  ADD COLUMN IF NOT EXISTS exchange_date                 date,
  ADD COLUMN IF NOT EXISTS cooling_off_waived            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cooling_off_expires           date,
  ADD COLUMN IF NOT EXISTS anticipated_settlement_date   date,
  ADD COLUMN IF NOT EXISTS settlement_date               date,
  ADD COLUMN IF NOT EXISTS deposit_initial_required      numeric(12,2),
  ADD COLUMN IF NOT EXISTS deposit_initial_due_date      date,
  ADD COLUMN IF NOT EXISTS deposit_balance_required      numeric(12,2),
  ADD COLUMN IF NOT EXISTS deposit_balance_due_date      date,
  ADD COLUMN IF NOT EXISTS deposit_returned              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lost_reason                   text,
  ADD COLUMN IF NOT EXISTS external_source               text,
  ADD COLUMN IF NOT EXISTS external_url                  text,
  ADD COLUMN IF NOT EXISTS external_stage                text,
  ADD COLUMN IF NOT EXISTS external_synced_at            timestamptz;

CREATE INDEX IF NOT EXISTS partner_enquiries_direct_idx
  ON partner_enquiries (updated_at DESC) WHERE partner_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS partner_enquiries_external_url_key
  ON partner_enquiries (external_url) WHERE external_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS deal_payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id      uuid NOT NULL REFERENCES partner_enquiries(id) ON DELETE CASCADE,
  kind         text NOT NULL DEFAULT 'initial_deposit'
                 CHECK (kind IN ('initial_deposit','balance_deposit','refund','other')),
  amount       numeric(12,2) NOT NULL CHECK (amount > 0),
  received_on  date NOT NULL,
  method       text,
  reference    text,
  note         text,
  created_by   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deal_payments_deal_idx ON deal_payments (deal_id, received_on);

CREATE TABLE IF NOT EXISTS deal_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid NOT NULL REFERENCES partner_enquiries(id) ON DELETE CASCADE,
  name          text NOT NULL,
  storage_path  text NOT NULL UNIQUE,
  size_bytes    bigint,
  mime_type     text,
  category      text NOT NULL DEFAULT 'other'
                  CHECK (category IN ('sales_advice','buyer_id','contract','deposit_receipt','other')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready')),
  uploaded_by   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deal_files_deal_idx ON deal_files (deal_id, created_at DESC);

ALTER TABLE deal_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_files    ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('deal-files', 'deal-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

COMMIT;
