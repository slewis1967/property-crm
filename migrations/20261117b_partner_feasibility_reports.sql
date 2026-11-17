-- Planning feasibility reports run by channel partners (Enterprise plan,
-- feature `feasibility`). One row per generated report: it is the partner's
-- saved copy to reopen and print, and the count of rows this month is the
-- firm's usage against its monthly allowance (utils/partner-feasibility.ts).
--
-- The address is one the PARTNER typed (their client's own site). It is never
-- a stock lot's address: stock is masked, and the portal has no way to run a
-- report on a lot.
--
-- Additive only. RLS on with zero policies (service-role access), like every
-- other partner table.

CREATE TABLE IF NOT EXISTS partner_feasibility_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  created_by_user_id  uuid REFERENCES partner_users(id) ON DELETE SET NULL,
  address             text NOT NULL,
  objective           text,
  title               text,
  report              jsonb NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_feasibility_reports_partner_idx
  ON partner_feasibility_reports (partner_id, created_at DESC);

ALTER TABLE partner_feasibility_reports ENABLE ROW LEVEL SECURITY;
