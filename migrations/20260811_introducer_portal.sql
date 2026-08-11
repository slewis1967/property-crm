-- Introducer portal — third-party introducers register clients for the Your Loan
-- Assist (YLA) product, then track that client's progress, without ever seeing
-- another introducer's clients or any internal CRM surface.
--
-- THREE RULES THIS SCHEMA EXISTS TO ENFORCE
--
--   1. SEGREGATION. An introducer sees their own clients and nothing else. Every
--      introducer-facing row carries `introducer_id`, and every introducer-facing
--      query filters on the id resolved from the session cookie — never from
--      anything the caller sent. There is no introducer-facing query that can
--      return a row without that filter.
--
--   2. SUBMIT = LOCK. Once a client is submitted, the introducer cannot change
--      anything. The lock is not a UI state: `introducer_clients_locked_guard`
--      is a database trigger that rejects any write to a submitted row unless an
--      unlock grant is active. Even a bug in a route handler cannot edit a
--      locked record.
--
--   3. ONE AUTHORITY. Only a super admin (SUPER_ADMIN_EMAILS, default Sean) can
--      issue an unlock grant, and every grant is single-use and time-boxed by
--      default. Staff can ask an introducer for more information — that opens a
--      scoped, ADDITIVE window (fill blanks, upload documents) which closes the
--      moment it's answered. It never permits altering what was already
--      submitted.
--
-- SENSITIVITY: these tables hold third-party client PII supplied before any
-- engagement exists — name, contact details, income, and uploaded documents.
-- Collect the minimum needed to assess a referral. Access is service-role only:
-- the anon key must never reach these tables, and the storage bucket is private
-- with signed-URL reads, matching the client-documents posture.
--
-- Consent note: the introducer asserts, at submit time, that the client has
-- consented to their details being passed to NextKey (Privacy Act APP 3/APP 5).
-- That assertion is stored on the row (`consent_confirmed_at`) because it is the
-- lawful basis for us holding the record at all.

-- ── Introducer firms ─────────────────────────────────────────────────────────
-- The organisation we have an introducer agreement with. Commission/agreement
-- terms are referenced, not calculated, here — the referral fee arrangement
-- lives in the signed agreement, and this only records which one applies.
CREATE TABLE IF NOT EXISTS introducers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  firm_name         text NOT NULL,
  contact_name      text,
  contact_email     text,
  contact_phone     text,

  -- Where the introducer sits in the licensing chain. Free text so the
  -- arrangement can be described exactly as the agreement words it (e.g.
  -- "Introducer under YLA licence, COMP-8317"). NOT used to drive logic.
  agreement_ref     text,
  agreement_signed_at timestamptz,
  abn               text,
  notes             text,               -- internal only; never sent to the portal

  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','suspended','terminated')),

  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS introducers_status_idx ON introducers (status);

-- ── Introducer logins ────────────────────────────────────────────────────────
-- A person at an introducer firm. Email is the identity: sign-in is a one-time
-- code, so there is no password to store, leak, or reset. Suspending a user (or
-- the firm) takes effect on the next request because every session lookup joins
-- back to both statuses.
CREATE TABLE IF NOT EXISTS introducer_users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  introducer_id     uuid NOT NULL REFERENCES introducers(id) ON DELETE CASCADE,

  email             text NOT NULL,
  full_name         text,
  -- The firm's main contact. Cosmetic today (shown in the admin list); kept so
  -- a future "notify the principal" step has something to aim at.
  is_primary        boolean NOT NULL DEFAULT false,

  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','suspended')),

  invited_by        text,
  invited_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One login per email address, globally. Case-insensitive: the app lower-cases
-- on write, and this index makes "Sam@firm.com" and "sam@firm.com" the same row
-- even if a script forgets to. A person who moves firms gets their old row
-- suspended and a new one created — we never repoint an existing login, so the
-- audit trail of who submitted what stays honest.
CREATE UNIQUE INDEX IF NOT EXISTS introducer_users_email_key
  ON introducer_users (lower(email));
CREATE INDEX IF NOT EXISTS introducer_users_firm_idx ON introducer_users (introducer_id);

-- ── One-time sign-in codes ───────────────────────────────────────────────────
-- Two credentials are issued per attempt and either can be redeemed: a click-
-- through link (256-bit token) and a 6-digit code for people who read mail on a
-- different device. Only hashes are stored, so a database leak yields nothing
-- replayable. Short-lived, single-use, attempt-capped.
CREATE TABLE IF NOT EXISTS introducer_login_codes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  introducer_user_id uuid NOT NULL REFERENCES introducer_users(id) ON DELETE CASCADE,

  -- SHA-256 of the emailed link token, and of the 6-digit code respectively.
  link_token_hash   text NOT NULL,
  code_hash         text NOT NULL,

  -- Wrong-code attempts against THIS row. At the cap the row is dead and the
  -- user must request a new code — this is what stops a 6-digit code being
  -- brute-forced (10^6 space, but only a handful of guesses are ever allowed).
  attempts          int NOT NULL DEFAULT 0,

  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz,
  requested_ip      text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS introducer_login_codes_link_idx ON introducer_login_codes (link_token_hash);
CREATE INDEX IF NOT EXISTS introducer_login_codes_user_idx ON introducer_login_codes (introducer_user_id, created_at DESC);

-- ── Sessions ─────────────────────────────────────────────────────────────────
-- The cookie carries a raw 256-bit token; we store its hash. `introducer_id` is
-- denormalised onto the session so the segregation filter is available from the
-- session lookup alone — one query, no join to get wrong.
CREATE TABLE IF NOT EXISTS introducer_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash        text NOT NULL UNIQUE,

  introducer_user_id uuid NOT NULL REFERENCES introducer_users(id) ON DELETE CASCADE,
  introducer_id     uuid NOT NULL REFERENCES introducers(id) ON DELETE CASCADE,

  issued_at         timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  revoked_reason    text,

  issued_ip         text,
  user_agent_hash   text            -- SHA-256 of the UA string; a coarse theft signal, never an auth factor
);

CREATE INDEX IF NOT EXISTS introducer_sessions_token_idx ON introducer_sessions (token_hash);
CREATE INDEX IF NOT EXISTS introducer_sessions_user_idx  ON introducer_sessions (introducer_user_id);

-- ── Client submissions ───────────────────────────────────────────────────────
-- The referral itself. Lives here, NOT in the CRM pipeline, until a super admin
-- accepts it: unvetted third-party data must not create contacts, fire
-- automations, or pollute lead reporting on the strength of a form post.
--
-- STATUS MACHINE (see utils/introducer.ts — keep the two in step):
--   draft          introducer is filling it in; freely editable
--   submitted      locked; awaiting review
--   info_requested locked, except additive answers to open info requests
--   accepted       locked; promoted to a CRM opportunity; progress visible
--   declined       locked; terminal
--   withdrawn      locked; terminal (withdrawn by us, reason recorded)
CREATE TABLE IF NOT EXISTS introducer_clients (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  introducer_id     uuid NOT NULL REFERENCES introducers(id) ON DELETE RESTRICT,
  submitted_by      uuid REFERENCES introducer_users(id) ON DELETE SET NULL,

  -- Human-friendly reference, quoted by both sides. Sequence + column default =
  -- assigned atomically at insert, no app logic and no race (same trick as
  -- document_requests.client_ref).
  client_ref        text,

  -- Client identity + contact.
  first_name        text NOT NULL DEFAULT '',
  last_name         text NOT NULL DEFAULT '',
  email             text,
  phone             text,
  dob               date,
  state             text,
  suburb            text,
  postcode          text,

  -- Second applicant, when the referral is a couple. Kept as flat columns rather
  -- than a child table: a referral is a snapshot, not a maintained record, and
  -- the CRM owns the real applicant model once accepted.
  applicant2_first_name text,
  applicant2_last_name  text,
  applicant2_email      text,
  applicant2_phone      text,

  -- Referral substance. Deliberately coarse — enough to triage, not a fact find.
  -- Do NOT extend this with credit-file, medical, or government-identifier
  -- fields: those are collected later, in the client's own portal, under an
  -- engagement, where the AML/Privacy basis exists.
  employment_status text,
  income_band       text,
  deposit_band      text,
  purchase_intent   text,
  timeframe         text,
  buying_in         text,
  notes             text,               -- introducer's own context

  -- Privacy Act basis for us holding this at all. Set at submit; the portal
  -- refuses to submit without it.
  consent_confirmed_at timestamptz,
  consent_statement text,

  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','submitted','info_requested','accepted','declined','withdrawn')),
  submitted_at      timestamptz,
  decided_at        timestamptz,
  decided_by        text,
  decision_reason   text,               -- internal; only surfaced if `message_to_introducer` repeats it

  -- Progress the introducer is allowed to see. `stage` is one of
  -- INTRODUCER_STAGES; nothing else about the CRM record is exposed.
  stage             text,
  stage_updated_at  timestamptz,
  -- The ONLY free text that travels back to the introducer. Written
  -- deliberately by staff. Internal notes never appear in the portal.
  message_to_introducer text,

  -- Links into the CRM, populated on accept. Soft FKs: opportunities live in
  -- NEXUS, not Supabase (same posture as deal_packets.opportunity_id).
  opportunity_id    text,
  contact_id        text,
  document_request_id uuid,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS introducer_clients_ref_seq START 5001;
ALTER TABLE introducer_clients
  ALTER COLUMN client_ref SET DEFAULT ('NKI-' || nextval('introducer_clients_ref_seq'));
UPDATE introducer_clients
  SET client_ref = 'NKI-' || nextval('introducer_clients_ref_seq')
  WHERE client_ref IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS introducer_clients_ref_key ON introducer_clients (client_ref);
-- The segregation index: every portal list query is (introducer_id, status).
CREATE INDEX IF NOT EXISTS introducer_clients_firm_idx   ON introducer_clients (introducer_id, status);
CREATE INDEX IF NOT EXISTS introducer_clients_status_idx ON introducer_clients (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS introducer_clients_email_idx  ON introducer_clients (lower(email));

-- ── Unlock grants ────────────────────────────────────────────────────────────
-- The ONLY thing that lets an introducer edit a submitted record. Issued by a
-- super admin. Single-use and time-boxed by default, so an unlock cannot quietly
-- become a standing permission.
CREATE TABLE IF NOT EXISTS introducer_unlock_grants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES introducer_clients(id) ON DELETE CASCADE,

  granted_by        text NOT NULL,      -- super admin email; the authority record
  reason            text NOT NULL,      -- why the change was authorised

  -- 'full' unlocks every editable field; 'fields' restricts to `fields`.
  scope             text NOT NULL DEFAULT 'fields'
                      CHECK (scope IN ('full','fields')),
  fields            text[] NOT NULL DEFAULT '{}',

  single_use        boolean NOT NULL DEFAULT true,
  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz,
  revoked_at        timestamptz,
  revoked_by        text,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS introducer_unlock_grants_client_idx ON introducer_unlock_grants (client_id, created_at DESC);

-- ── Information requests ─────────────────────────────────────────────────────
-- "We need more from you." Opens an ADDITIVE window: the introducer may fill
-- named fields that are currently blank and upload the named documents. It does
-- not authorise changing anything already submitted — that still needs a grant.
-- Answering closes the window and the record re-locks.
CREATE TABLE IF NOT EXISTS introducer_info_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES introducer_clients(id) ON DELETE CASCADE,

  requested_by      text NOT NULL,      -- staff email
  message           text NOT NULL,      -- shown verbatim in the portal

  fields            text[] NOT NULL DEFAULT '{}',   -- blank fields they may fill
  documents         text[] NOT NULL DEFAULT '{}',   -- document labels they may upload

  status            text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','answered','cancelled')),
  due_at            timestamptz,
  answered_at       timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS introducer_info_requests_client_idx ON introducer_info_requests (client_id, status);

-- ── Documents supplied by an introducer ──────────────────────────────────────
-- Always tied to the info request that asked for them, so an introducer cannot
-- push unsolicited files at a locked record.
CREATE TABLE IF NOT EXISTS introducer_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES introducer_clients(id) ON DELETE CASCADE,
  info_request_id   uuid REFERENCES introducer_info_requests(id) ON DELETE SET NULL,

  label             text NOT NULL,
  filename          text NOT NULL,
  original_name     text,
  storage_path      text NOT NULL,
  mime_type         text,
  size_bytes        bigint,

  uploaded_by       uuid REFERENCES introducer_users(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'uploaded'
                      CHECK (status IN ('uploaded','accepted','rejected','replaced')),
  check_notes       text,
  uploaded_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS introducer_documents_client_idx ON introducer_documents (client_id, status);

-- ── Audit trail ──────────────────────────────────────────────────────────────
-- Append-only. Who did what to a referral, from both sides. This is the record
-- that answers "was this change authorised, and by whom" — so it must not be
-- editable by the code that writes it. The trigger below enforces that at the
-- database, not by convention.
CREATE TABLE IF NOT EXISTS introducer_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid REFERENCES introducer_clients(id) ON DELETE CASCADE,
  introducer_id     uuid REFERENCES introducers(id) ON DELETE SET NULL,

  actor_type        text NOT NULL
                      CHECK (actor_type IN ('introducer','staff','super_admin','system')),
  actor             text NOT NULL,      -- email, or 'system'
  action            text NOT NULL,      -- 'submitted', 'unlock_granted', 'accepted', …
  detail            jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS introducer_events_client_idx ON introducer_events (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS introducer_events_firm_idx   ON introducer_events (introducer_id, created_at DESC);

CREATE OR REPLACE FUNCTION introducer_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'introducer_events is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS introducer_events_no_update ON introducer_events;
CREATE TRIGGER introducer_events_no_update
  BEFORE UPDATE OR DELETE ON introducer_events
  FOR EACH ROW EXECUTE FUNCTION introducer_events_append_only();

-- ── The lock, enforced in the database ───────────────────────────────────────
-- Rule 2 above. A submitted referral is immutable to the introducer-editable
-- fields unless an unlock grant is currently active, or an open info request
-- names the field AND the field is being filled from blank (additive only).
--
-- Why a trigger and not just route code: the whole promise to Sean is "they
-- cannot change anything unless I authorise it". A promise that depends on
-- every future route handler remembering a check is not a promise. This makes
-- the unauthorised edit impossible rather than merely unimplemented — including
-- from a psql session, a script, or a route written next year.
--
-- STAFF-CONTROLLED COLUMNS ARE NOT COVERED. status, stage, decision fields,
-- CRM links and message_to_introducer are ours to write at any time; the guard
-- only defends the client-detail columns the introducer supplied.
CREATE OR REPLACE FUNCTION introducer_clients_locked_guard() RETURNS trigger AS $$
DECLARE
  editable_changed boolean;
  filled_from_blank boolean;
  active_grant introducer_unlock_grants%ROWTYPE;
  changed text[];
  col text;
  open_fields text[];
BEGIN
  -- Drafts are freely editable, and a row that is still draft after the write
  -- has nothing to protect yet.
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- Which introducer-editable columns actually changed?
  changed := ARRAY[]::text[];
  IF NEW.first_name IS DISTINCT FROM OLD.first_name THEN changed := changed || 'first_name'; END IF;
  IF NEW.last_name  IS DISTINCT FROM OLD.last_name  THEN changed := changed || 'last_name';  END IF;
  IF NEW.email      IS DISTINCT FROM OLD.email      THEN changed := changed || 'email';      END IF;
  IF NEW.phone      IS DISTINCT FROM OLD.phone      THEN changed := changed || 'phone';      END IF;
  IF NEW.dob        IS DISTINCT FROM OLD.dob        THEN changed := changed || 'dob';        END IF;
  IF NEW.state      IS DISTINCT FROM OLD.state      THEN changed := changed || 'state';      END IF;
  IF NEW.suburb     IS DISTINCT FROM OLD.suburb     THEN changed := changed || 'suburb';     END IF;
  IF NEW.postcode   IS DISTINCT FROM OLD.postcode   THEN changed := changed || 'postcode';   END IF;
  IF NEW.applicant2_first_name IS DISTINCT FROM OLD.applicant2_first_name THEN changed := changed || 'applicant2_first_name'; END IF;
  IF NEW.applicant2_last_name  IS DISTINCT FROM OLD.applicant2_last_name  THEN changed := changed || 'applicant2_last_name';  END IF;
  IF NEW.applicant2_email      IS DISTINCT FROM OLD.applicant2_email      THEN changed := changed || 'applicant2_email';      END IF;
  IF NEW.applicant2_phone      IS DISTINCT FROM OLD.applicant2_phone      THEN changed := changed || 'applicant2_phone';      END IF;
  IF NEW.employment_status IS DISTINCT FROM OLD.employment_status THEN changed := changed || 'employment_status'; END IF;
  IF NEW.income_band       IS DISTINCT FROM OLD.income_band       THEN changed := changed || 'income_band';       END IF;
  IF NEW.deposit_band      IS DISTINCT FROM OLD.deposit_band      THEN changed := changed || 'deposit_band';      END IF;
  IF NEW.purchase_intent   IS DISTINCT FROM OLD.purchase_intent   THEN changed := changed || 'purchase_intent';   END IF;
  IF NEW.timeframe         IS DISTINCT FROM OLD.timeframe         THEN changed := changed || 'timeframe';         END IF;
  IF NEW.buying_in         IS DISTINCT FROM OLD.buying_in         THEN changed := changed || 'buying_in';         END IF;
  IF NEW.notes             IS DISTINCT FROM OLD.notes             THEN changed := changed || 'notes';             END IF;

  editable_changed := array_length(changed, 1) IS NOT NULL;
  IF NOT editable_changed THEN
    RETURN NEW;    -- staff-only columns moved; nothing to guard
  END IF;

  -- An active unlock grant authorises the change. 'fields' scope must cover
  -- every changed column.
  SELECT * INTO active_grant
    FROM introducer_unlock_grants g
   WHERE g.client_id = NEW.id
     AND g.consumed_at IS NULL
     AND g.revoked_at IS NULL
     AND g.expires_at > now()
     AND (g.scope = 'full' OR changed <@ g.fields)
   ORDER BY g.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  -- Otherwise the only permitted write is filling a blank field that an OPEN
  -- info request named. Additive only: every changed column must have been
  -- NULL/empty before, and must be non-empty now.
  SELECT COALESCE(array_agg(DISTINCT f), ARRAY[]::text[]) INTO open_fields
    FROM introducer_info_requests r, unnest(r.fields) AS f
   WHERE r.client_id = NEW.id AND r.status = 'open';

  filled_from_blank := true;
  FOREACH col IN ARRAY changed LOOP
    IF NOT (col = ANY(open_fields)) THEN
      filled_from_blank := false;
      EXIT;
    END IF;
    -- Was it blank before, and is it non-blank now?
    IF COALESCE(NULLIF(trim(to_jsonb(OLD) ->> col), ''), '') <> '' THEN
      filled_from_blank := false;
      EXIT;
    END IF;
    IF COALESCE(NULLIF(trim(to_jsonb(NEW) ->> col), ''), '') = '' THEN
      filled_from_blank := false;
      EXIT;
    END IF;
  END LOOP;

  IF filled_from_blank THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'introducer_clients % is locked: % changed without an active unlock grant. A super admin must authorise this change.',
    COALESCE(NEW.client_ref, NEW.id::text), array_to_string(changed, ', ')
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS introducer_clients_lock ON introducer_clients;
CREATE TRIGGER introducer_clients_lock
  BEFORE UPDATE ON introducer_clients
  FOR EACH ROW EXECUTE FUNCTION introducer_clients_locked_guard();

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- Private, service-role only, signed-URL reads. Same posture and rationale as
-- the client-documents bucket: the anon key must never touch it.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'introducer-documents',
  'introducer-documents',
  FALSE,
  15 * 1024 * 1024,
  ARRAY['application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp']
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE introducers IS
  'Third-party introducer firms referring clients to the YLA product.';
COMMENT ON TABLE introducer_users IS
  'People who can sign in to the introducer portal. One-time-code auth — no passwords stored.';
COMMENT ON TABLE introducer_clients IS
  'Client referrals from introducers. Locked on submit; edits require a super-admin unlock grant (enforced by the introducer_clients_lock trigger).';
COMMENT ON TABLE introducer_unlock_grants IS
  'Super-admin authorisations to edit a submitted referral. Single-use and time-boxed by default.';
COMMENT ON TABLE introducer_info_requests IS
  'Staff requests for more information. Opens an additive-only window: fill named blank fields, upload named documents.';
COMMENT ON TABLE introducer_events IS
  'Append-only audit trail for the introducer portal. UPDATE/DELETE are rejected by trigger.';
