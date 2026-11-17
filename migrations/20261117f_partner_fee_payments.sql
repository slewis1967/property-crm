-- NOVA-011: partner pay clarity. Staff-recorded payment dates on a settled deal
-- (channel partners) and a settled referral (introducers), so each portal can
-- say when the partner gets paid and that they have been.
--
-- NOT APPLIED. Written for Sean to run in the Supabase SQL editor (gate 6).
-- The code on this branch reads these columns in a SEPARATE query and degrades
-- when they are missing (payColumnsMissing in utils/partner-pay.ts): the
-- portals still show the pay terms, staff get "run the migration" when they
-- try to record a date. So it is safe to land the code before or after this.
--
-- NO NEW TERMS. The columns only record the events the signed agreements
-- already name: the developer's / Springboard's fee arriving, the partner's
-- tax invoice arriving, and the payment (partner agreement clause 5.4;
-- introducer agreement "When it is payable").
--
-- What is NOT stored: the gross developer fee or NextKey's share. Those stay in
-- property_financials; the amount here is only what was paid to the partner.
--
-- Idempotent.

ALTER TABLE partner_enquiries
  ADD COLUMN IF NOT EXISTS funds_received_on   date,
  ADD COLUMN IF NOT EXISTS invoice_received_on date,
  ADD COLUMN IF NOT EXISTS fee_paid_on         date,
  ADD COLUMN IF NOT EXISTS fee_paid_amount     numeric(12,2);

COMMENT ON COLUMN partner_enquiries.funds_received_on IS
  'Date NextKey received the developer''s fee for this lot (clause 5.4 clock starts). Staff-entered.';
COMMENT ON COLUMN partner_enquiries.invoice_received_on IS
  'Date the partner''s valid tax invoice was received. Staff-entered.';
COMMENT ON COLUMN partner_enquiries.fee_paid_on IS
  'Date the referral fee was paid to the partner. Staff-entered.';
COMMENT ON COLUMN partner_enquiries.fee_paid_amount IS
  'Amount paid to the partner, ex GST (the partner''s own fee, never the gross).';

ALTER TABLE partner_enquiries DROP CONSTRAINT IF EXISTS partner_enquiries_pay_only_when_settled;
ALTER TABLE partner_enquiries ADD CONSTRAINT partner_enquiries_pay_only_when_settled CHECK (
  stage = 'settled'
  OR (funds_received_on IS NULL AND invoice_received_on IS NULL AND fee_paid_on IS NULL AND fee_paid_amount IS NULL)
);

ALTER TABLE partner_enquiries DROP CONSTRAINT IF EXISTS partner_enquiries_paid_needs_receipts;
ALTER TABLE partner_enquiries ADD CONSTRAINT partner_enquiries_paid_needs_receipts CHECK (
  fee_paid_on IS NULL
  OR (funds_received_on IS NOT NULL AND invoice_received_on IS NOT NULL
      AND fee_paid_on >= funds_received_on AND fee_paid_on >= invoice_received_on)
);

ALTER TABLE partner_enquiries DROP CONSTRAINT IF EXISTS partner_enquiries_paid_amount_valid;
ALTER TABLE partner_enquiries ADD CONSTRAINT partner_enquiries_paid_amount_valid CHECK (
  fee_paid_amount IS NULL OR (fee_paid_amount > 0 AND fee_paid_on IS NOT NULL)
);

-- Introducers. Same four events. The introducer portal does not show these
-- until the Springboard wording has YLA's written clause-7 approval
-- (INTRODUCER_PAY_WORDING_APPROVAL in utils/partner-pay.ts). The columns are
-- added now so one migration covers both; the staff write path for introducer
-- dates is NOT built yet and comes with the switch-on.
ALTER TABLE introducer_clients
  ADD COLUMN IF NOT EXISTS funds_received_on   date,
  ADD COLUMN IF NOT EXISTS invoice_received_on date,
  ADD COLUMN IF NOT EXISTS fee_paid_on         date,
  ADD COLUMN IF NOT EXISTS fee_paid_amount     numeric(12,2);

ALTER TABLE introducer_clients DROP CONSTRAINT IF EXISTS introducer_clients_pay_only_when_settled;
ALTER TABLE introducer_clients ADD CONSTRAINT introducer_clients_pay_only_when_settled CHECK (
  stage = 'settled'
  OR (funds_received_on IS NULL AND invoice_received_on IS NULL AND fee_paid_on IS NULL AND fee_paid_amount IS NULL)
);

ALTER TABLE introducer_clients DROP CONSTRAINT IF EXISTS introducer_clients_paid_needs_receipts;
ALTER TABLE introducer_clients ADD CONSTRAINT introducer_clients_paid_needs_receipts CHECK (
  fee_paid_on IS NULL
  OR (funds_received_on IS NOT NULL AND invoice_received_on IS NOT NULL
      AND fee_paid_on >= funds_received_on AND fee_paid_on >= invoice_received_on)
);

ALTER TABLE introducer_clients DROP CONSTRAINT IF EXISTS introducer_clients_paid_amount_valid;
ALTER TABLE introducer_clients ADD CONSTRAINT introducer_clients_paid_amount_valid CHECK (
  fee_paid_amount IS NULL OR (fee_paid_amount > 0 AND fee_paid_on IS NOT NULL)
);

-- NOTE on introducer_clients_locked_guard: that trigger guards the
-- introducer-editable fields after submit. These four columns are staff-only
-- and are not in INTRODUCER_FIELDS, so the trigger does not need them and the
-- portal has no path that writes them.
