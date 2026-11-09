-- Property shortlists - staff pick one or many lots from the Aggregator Feed and
-- send a client a private link (crm.nextkey.com.au/shortlist/<token>) to view
-- them, with comparison, cashflow, duty and suburb reports, register interest
-- per property, and book a call.
--
-- THREE RULES THIS SCHEMA EXISTS TO ENFORCE
--
--   1. THE LINK IS THE CREDENTIAL, AND WE NEVER HOLD IT. Only the SHA-256 of the
--      256-bit token is stored (utils/sign-token.ts), exactly as the document
--      portal does. A database leak cannot be replayed as a client link, and a
--      lost link is replaced by sending a new shortlist, never recovered.
--
--   2. THE SUPPLIER IS NEVER IN THE PORTAL. Builder, estate, lot number and
--      street address stay in global_stock_pool. The client view is the partner
--      portal's whitelist projection (utils/partner.ts toPartnerLot) plus
--      photos; nothing here stores supplier identity either. Staff reveal it
--      when a deal progresses, outside this feature.
--
--   3. WHAT THE CLIENT SAID CANNOT BE REWRITTEN. Responses are stored on the
--      item for display, and every response is also written to the append-only
--      property_shortlist_events, so "the client said they were interested" is
--      evidence rather than a mutable field.
--
-- Access is service-role only (RLS on, zero policies): the anon key ships to
-- the browser and must never reach these tables.

-- -- One shortlist = one link sent to one client ---------------------------------
CREATE TABLE IF NOT EXISTS property_shortlists (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash        text NOT NULL UNIQUE,

  -- Soft links: contacts are CRM rows, opportunities live in NEXUS. Deleting
  -- either must not fail because a shortlist once pointed at it.
  contact_id        uuid,
  opportunity_id    text,

  client_name       text NOT NULL,
  client_email      text,

  title             text,
  message           text,               -- from the consultant, shown at the top of the portal

  -- Report assumptions chosen by staff (deposit %, rate, term, repayment type,
  -- first home buyer). Parsed and clamped by utils/property-shortlist.ts.
  assumptions       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- utils/scheduling-hosts.ts slug for the "book a call" link.
  booking_slug      text,

  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','revoked')),
  expires_at        timestamptz NOT NULL,

  first_viewed_at   timestamptz,
  last_viewed_at    timestamptz,
  view_count        integer NOT NULL DEFAULT 0,

  created_by        text NOT NULL,
  revoked_by        text,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_shortlists_contact_idx
  ON property_shortlists (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS property_shortlists_created_idx
  ON property_shortlists (created_at DESC);

-- -- The properties on a shortlist ------------------------------------------------
CREATE TABLE IF NOT EXISTS property_shortlist_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id          uuid NOT NULL REFERENCES property_shortlists(id) ON DELETE CASCADE,
  -- global_stock_pool.id, deliberately SOFT: the aggregator and feed clean-up
  -- scripts own that table's lifecycle. lot_snapshot keeps the item legible if
  -- the row goes.
  property_id           uuid NOT NULL,
  position              integer NOT NULL DEFAULT 0,

  -- Only 43 of 827 active lots carried an expected rent on 2026-09-14, so the
  -- consultant can supply one per property for the yield and cashflow reports.
  rent_weekly_override  numeric(10,2) CHECK (rent_weekly_override IS NULL OR rent_weekly_override > 0),
  staff_note            text,           -- shown to the client ("why we picked this one")

  -- The masked client view at the moment of sending (no supplier fields).
  lot_snapshot          jsonb NOT NULL DEFAULT '{}'::jsonb,

  client_response       text CHECK (client_response IS NULL OR client_response IN ('interested','not_for_me')),
  client_note           text,
  responded_at          timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT property_shortlist_items_one_per_lot UNIQUE (shortlist_id, property_id)
);

CREATE INDEX IF NOT EXISTS property_shortlist_items_shortlist_idx
  ON property_shortlist_items (shortlist_id, position);
CREATE INDEX IF NOT EXISTS property_shortlist_items_property_idx
  ON property_shortlist_items (property_id);

-- -- Audit trail (append-only) ------------------------------------------------------
CREATE TABLE IF NOT EXISTS property_shortlist_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id  uuid NOT NULL,
  item_id       uuid,
  actor_type    text NOT NULL CHECK (actor_type IN ('client','staff','system')),
  actor         text NOT NULL,
  action        text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_shortlist_events_shortlist_idx
  ON property_shortlist_events (shortlist_id, created_at DESC);

CREATE OR REPLACE FUNCTION property_shortlist_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'property_shortlist_events is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS property_shortlist_events_no_update ON property_shortlist_events;
CREATE TRIGGER property_shortlist_events_no_update
  BEFORE UPDATE OR DELETE ON property_shortlist_events
  FOR EACH ROW EXECUTE FUNCTION property_shortlist_events_append_only();

-- -- Default-deny -----------------------------------------------------------------------
ALTER TABLE property_shortlists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_shortlist_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_shortlist_events  ENABLE ROW LEVEL SECURITY;
