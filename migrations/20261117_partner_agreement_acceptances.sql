-- Channel-partner agreement acceptance (portal "click to sign").
--
-- A firm cannot use /partner until partners.agreement_ref equals the current
-- version (utils/partner-agreement.ts PARTNER_AGREEMENT_VERSION) and
-- agreement_signed_at is set. Accepting in the portal writes one row here and
-- then stamps the firm. Staff can still stamp the firm directly on
-- /admin/partners when the agreement was signed on paper or by DocuSign; those
-- firms simply have no row here.
--
-- The row is the signature record, so it keeps the evidence on its own:
--   * agreement_text is the exact text shown, with the firm's details filled in,
--     and text_sha256 its hash — independent of whatever the code says later;
--   * who signed (name, position, login email), for which entity and ABN;
--   * when, from which IP, with which browser.
-- It is append-only: a signature record that can be edited proves nothing.
--
-- Additive only. RLS on with zero policies (service-role access), like every
-- other partner table.

CREATE TABLE IF NOT EXISTS partner_agreement_acceptances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        uuid NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  partner_user_id   uuid REFERENCES partner_users(id) ON DELETE SET NULL,

  version           text NOT NULL,
  agreement_text    text NOT NULL,
  text_sha256       text NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),

  signer_name       text NOT NULL,
  signer_title      text NOT NULL,
  signer_email      text NOT NULL,
  entity_name       text NOT NULL,
  abn               text NOT NULL CHECK (abn ~ '^[0-9]{11}$'),

  ip                text,
  user_agent        text,
  accepted_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_agreement_acceptances_partner_idx
  ON partner_agreement_acceptances (partner_id, accepted_at DESC);

CREATE OR REPLACE FUNCTION partner_agreement_acceptances_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'partner_agreement_acceptances is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS partner_agreement_acceptances_no_change ON partner_agreement_acceptances;
CREATE TRIGGER partner_agreement_acceptances_no_change
  BEFORE UPDATE OR DELETE ON partner_agreement_acceptances
  FOR EACH ROW EXECUTE FUNCTION partner_agreement_acceptances_append_only();

ALTER TABLE partner_agreement_acceptances ENABLE ROW LEVEL SECURITY;
