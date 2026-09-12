-- Channel-partner portal - external firms that SELL NextKey-sourced stock log in
-- at crm.nextkey.com.au/partner, browse the whole stock book, register their
-- buyers, and ask for holds. Each firm sees its own clients and deals and
-- nothing else; every firm sees the same stock.
--
-- FOUR RULES THIS SCHEMA EXISTS TO ENFORCE
--
--   1. SEGREGATION. Every partner-facing row carries `partner_id`, and every
--      partner-facing query filters on the id resolved from the session cookie -
--      never from anything the caller sent. A deal can only reference a client
--      of the SAME firm: that is a composite foreign key below, not a route
--      check, so even a buggy handler cannot attach firm A's deal to firm B's
--      buyer.
--
--   2. THE SUPPLIER IS NEVER IN THE PORTAL. Builder, estate, lot number and
--      street address stay in global_stock_pool; the portal reads a whitelist
--      projection (utils/partner.ts toPartnerLot). NextKey hands a lot's
--      identity to a partner per deal, by writing `revealed` on that deal - a
--      deliberate staff act, recorded in partner_events. Otherwise a partner
--      could go straight to the builder and cut NextKey out.
--
--   3. ONE ACTIVE HOLD PER LOT. Two partners can both ask for the same lot;
--      only one can hold it. Enforced by a partial unique index, so two staff
--      approving in two tabs cannot double-sell a lot.
--
--   4. THE PARTNER SEES THEIR FEE, NEVER OURS. The referral fee is derived in
--      utils/partner.ts from property_financials.gross_developer_fee (NextKey
--      keeps the greater of $10,000 or 30% of gross). Only the partner's figure
--      is snapshotted onto a deal; the gross fee and NextKey's share are never
--      stored in a partner table at all, so there is nothing to leak.
--
-- White-label and tiers: a firm's `tier` decides its features (utils/partner.ts
-- PARTNER_TIERS); `feature_grants` adds individual paid extras on request.
-- Branding is set by NextKey staff only - partners have no route that writes it.
--
-- Access is service-role only (RLS on, zero policies), matching the introducer
-- portal: the anon key ships to the browser and must never reach these tables.

-- -- Partner firms -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partners (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  firm_name           text NOT NULL,
  abn                 text,
  contact_name        text,
  contact_email       text,
  contact_phone       text,

  -- The recruitment record this firm came from, if any (/channel-partners).
  -- Soft link: that table is a prospect list, and deleting a prospect must not
  -- take a live partner with it.
  channel_partner_id  uuid,

  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','suspended','terminated')),

  -- Commercial terms live in the signed agreement; this records which one.
  agreement_ref       text,
  agreement_signed_at timestamptz,

  -- What they have paid for. See PARTNER_TIERS in utils/partner.ts.
  tier                text NOT NULL DEFAULT 'basic'
                        CHECK (tier IN ('basic','professional','enterprise')),
  -- Individual extras sold on request, on top of the tier (e.g. 'white_label').
  feature_grants      text[] NOT NULL DEFAULT '{}',
  -- White-label settings, staff-written only: {display_name, logo_url,
  -- primary_color, accent_color}. Applied only while the firm has the
  -- 'white_label' feature. Validated in utils/partner.ts parseBranding.
  branding            jsonb NOT NULL DEFAULT '{}'::jsonb,

  notes               text,                 -- internal only; never sent to the portal
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partners_status_idx ON partners (status);

-- -- Partner logins --------------------------------------------------------------
-- Email is the identity; sign-in is a one-time code, so there is no password.
CREATE TABLE IF NOT EXISTS partner_users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  email             text NOT NULL,
  full_name         text,
  phone             text,
  is_primary        boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','suspended')),
  invited_by        text,
  invited_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz,
  CONSTRAINT partner_users_email_lower CHECK (email = lower(email))
);

-- One login per address across ALL firms: an email that resolved to two firms
-- would make "which book am I looking at" a coin toss.
CREATE UNIQUE INDEX IF NOT EXISTS partner_users_email_key ON partner_users (email);
CREATE INDEX IF NOT EXISTS partner_users_partner_idx ON partner_users (partner_id);

-- -- One-time sign-in credentials ----------------------------------------------------
-- Only SHA-256 hashes are stored. See utils/partner-auth.ts.
CREATE TABLE IF NOT EXISTS partner_login_codes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id   uuid NOT NULL REFERENCES partner_users(id) ON DELETE CASCADE,
  link_token_hash   text NOT NULL UNIQUE,
  code_hash         text NOT NULL,
  attempts          integer NOT NULL DEFAULT 0,
  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz,
  requested_ip      text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_login_codes_user_idx
  ON partner_login_codes (partner_user_id, created_at DESC);

-- -- Sessions ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash        text NOT NULL UNIQUE,
  partner_user_id   uuid NOT NULL REFERENCES partner_users(id) ON DELETE CASCADE,
  partner_id        uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  expires_at        timestamptz NOT NULL,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  revoked_reason    text,
  issued_ip         text,
  user_agent_hash   text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_sessions_user_idx ON partner_sessions (partner_user_id);
CREATE INDEX IF NOT EXISTS partner_sessions_partner_idx ON partner_sessions (partner_id);

-- -- The partner's buyers ---------------------------------------------------------------
-- Third-party PII supplied by the partner. Minimum needed to run a deal.
CREATE TABLE IF NOT EXISTS partner_clients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  created_by_user_id  uuid REFERENCES partner_users(id) ON DELETE SET NULL,

  first_name          text NOT NULL,
  last_name           text,
  email               text,
  phone               text,
  state               text,
  budget_max          numeric(12,2),
  notes               text,

  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','archived')),

  -- The partner asserts the client agreed to their details coming to NextKey
  -- (Privacy Act APP 3/5). Stored because it is our lawful basis for holding them.
  consent_confirmed_at timestamptz NOT NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Target of the composite FK on partner_enquiries (rule 1).
  CONSTRAINT partner_clients_id_partner_key UNIQUE (id, partner_id)
);

CREATE INDEX IF NOT EXISTS partner_clients_partner_idx
  ON partner_clients (partner_id, updated_at DESC);

-- -- Deals: a partner's request on a lot, and everything after ----------------------------
-- requested -> hold -> eoi -> unconditional -> settled
--          \-> declined            hold/eoi/unconditional -> released
--          \-> withdrawn (by the partner, before we act)
CREATE TABLE IF NOT EXISTS partner_enquiries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id            uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  client_id             uuid NOT NULL,
  -- global_stock_pool.id, deliberately a SOFT reference: the NEXUS aggregator
  -- and the feed clean-up scripts own that table's lifecycle, and a partner deal
  -- must never make one of their deletes fail. lot_summary keeps the deal legible
  -- if the row goes.
  property_id           uuid NOT NULL,
  created_by_user_id    uuid REFERENCES partner_users(id) ON DELETE SET NULL,

  stage                 text NOT NULL DEFAULT 'requested'
                          CHECK (stage IN ('requested','hold','eoi','unconditional','settled',
                                           'declined','released','withdrawn')),
  stage_updated_at      timestamptz NOT NULL DEFAULT now(),

  partner_note          text,               -- from the partner
  message_to_partner    text,               -- the only free text that travels back
  staff_notes           text,               -- internal only; never sent to the portal

  -- What the partner saw when they asked (the masked lot, plus their fee), so
  -- the deal still reads correctly after the lot is repriced or withdrawn.
  lot_summary           jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_snapshot        numeric(12,2),
  -- The partner's referral fee only. Re-snapshotted when the hold is granted,
  -- which is the figure that binds. Never the gross fee or NextKey's share.
  referral_fee_snapshot numeric(12,2),

  -- Supplier identity, handed over by NextKey per deal (rule 2).
  -- {builder_name, estate_name, lot_number, street_address}
  revealed              jsonb NOT NULL DEFAULT '{}'::jsonb,
  revealed_at           timestamptz,
  revealed_by           text,

  hold_expires_at       timestamptz,
  decided_by            text,
  decision_reason       text,
  opportunity_id        text,               -- NEXUS opportunity, set when the hold is granted

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Rule 1: the client must belong to the same firm as the deal.
  CONSTRAINT partner_enquiries_client_same_firm
    FOREIGN KEY (client_id, partner_id)
    REFERENCES partner_clients (id, partner_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS partner_enquiries_partner_idx
  ON partner_enquiries (partner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS partner_enquiries_property_idx ON partner_enquiries (property_id);
CREATE INDEX IF NOT EXISTS partner_enquiries_stage_idx ON partner_enquiries (stage);

-- Rule 3. Keep the stage list in step with ACTIVE_HOLD_STAGES in utils/partner.ts.
CREATE UNIQUE INDEX IF NOT EXISTS partner_enquiries_one_active_hold
  ON partner_enquiries (property_id)
  WHERE stage IN ('hold','eoi','unconditional');

-- A firm asks for a given lot for a given buyer once while the ask is open.
CREATE UNIQUE INDEX IF NOT EXISTS partner_enquiries_one_open_per_client_lot
  ON partner_enquiries (partner_id, client_id, property_id)
  WHERE stage IN ('requested','hold','eoi','unconditional');

-- -- Audit trail (append-only) ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    uuid,
  enquiry_id    uuid,
  client_id     uuid,
  actor_type    text NOT NULL CHECK (actor_type IN ('partner','staff','super_admin','system')),
  actor         text NOT NULL,
  action        text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_events_partner_idx ON partner_events (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_events_enquiry_idx ON partner_events (enquiry_id, created_at DESC);

CREATE OR REPLACE FUNCTION partner_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'partner_events is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS partner_events_no_update ON partner_events;
CREATE TRIGGER partner_events_no_update
  BEFORE UPDATE OR DELETE ON partner_events
  FOR EACH ROW EXECUTE FUNCTION partner_events_append_only();

-- -- Default-deny ---------------------------------------------------------------------
-- RLS on, zero policies. The routes use the service-role key (bypasses RLS); the
-- anon key that ships to the browser gets nothing.
ALTER TABLE partners             ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_login_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_enquiries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_events       ENABLE ROW LEVEL SECURITY;
