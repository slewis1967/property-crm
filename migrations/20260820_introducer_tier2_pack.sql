-- Tier 2 submission pack — the portal affordance 20260819 said was coming.
--
-- That migration added `introducers.tier` and recorded, in its own comment, that
-- there was nothing yet for the column to gate: "t1 refers; t2 also completes the
-- fact find and collects documents… the portal has no Tier 2 affordance yet".
-- This is that affordance, so the column now gates something.
--
-- WHAT A TIER 2 PACK IS. The same submission a staff member assembles: the full
-- seven-page borrower fact find (utils/factfind.ts `FactFindData`, the identical
-- shape `borrower_fact_finds.data` holds), plus the document-collection session
-- the client uploads their payslips and ID into. A Tier 1 referral is unchanged.
--
-- WHAT CHANGES ABOUT THE TRUST MODEL — READ THIS BEFORE EXTENDING IT.
--
-- 20260811_introducer_portal.sql opens with the rule that nothing an introducer
-- submits reaches the CRM until a super admin accepts it: "unvetted third-party
-- data must not enter the lead pipeline, distort lead reporting, or trigger
-- outbound to someone we haven't verified consented to hear from."
--
-- A Tier 2 pack deliberately does NOT sit behind that gate. Sean's decision, 20
-- August 2026: an accredited Tier 2 introducer has passed the exam at that tier,
-- signed the agreement, had their identity verified and their NDA countersigned,
-- and the pack they submit is complete rather than a lead to triage. So submit
-- creates the opportunity, the fact find and the client's document request in
-- one move, and emails the client straight away.
--
-- The gate has therefore MOVED, not vanished. What now stands between an
-- introducer and a live CRM record is:
--   * accreditation not expired    (checked in the submit route, already)
--   * the signed consent form attached, not merely ticked  (ditto)
--   * tier = 't2', enforced below by a trigger and not only by route code
-- Weakening any of those three weakens the only remaining control. A Tier 1
-- referral still goes through the super-admin accept gate exactly as before.

-- ── The pack itself ──────────────────────────────────────────────────────────

-- 'referral' is the Tier 1 form that has always existed; 'full' is the Tier 2
-- pack. A CHECK rather than a boolean because a third pack shape is more likely
-- than the concept collapsing back to two states, and because the schema is
-- where the vocabulary belongs.
ALTER TABLE introducer_clients
  ADD COLUMN IF NOT EXISTS pack_type text NOT NULL DEFAULT 'referral';
ALTER TABLE introducer_clients DROP CONSTRAINT IF EXISTS introducer_clients_pack_type_check;
ALTER TABLE introducer_clients ADD CONSTRAINT introducer_clients_pack_type_check
  CHECK (pack_type IN ('referral','full'));

-- The fact find, held here rather than in `borrower_fact_finds` while it is
-- being written.
--
-- Not premature filing: borrower_fact_finds is a CRM table that /fact-find
-- lists, that the capacity engine reads, and that compliance treats as a real
-- document. A half-typed draft belonging to a referral nobody has submitted yet
-- does not belong in it. The blob is promoted into a genuine row at submit, and
-- `fact_find_id` records which one — so there is exactly one moment a fact find
-- comes into existence, and it is the same moment the opportunity does.
--
-- SAME SHAPE, ONE SCHEMA. This is `FactFindData` verbatim, so the promotion is a
-- copy and not a translation. Do not add introducer-only keys to it.
ALTER TABLE introducer_clients
  ADD COLUMN IF NOT EXISTS fact_find_data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The promoted row, once it exists. Soft FK, matching document_requests.fact_find_id.
ALTER TABLE introducer_clients
  ADD COLUMN IF NOT EXISTS fact_find_id uuid;

COMMENT ON COLUMN introducer_clients.pack_type IS
  'referral = Tier 1 basic details (super-admin accept gate applies). '
  'full = Tier 2 submission pack: fact find + document collection, no accept gate.';
COMMENT ON COLUMN introducer_clients.fact_find_data IS
  'utils/factfind.ts FactFindData, identical to borrower_fact_finds.data. Promoted to a real row at submit.';

-- Which pack a firm has actually been sending. Partial: full packs are the
-- minority and the queue view asks for them by name.
CREATE INDEX IF NOT EXISTS introducer_clients_pack_idx
  ON introducer_clients (introducer_id, pack_type)
  WHERE pack_type = 'full';

-- ── The document request points back ─────────────────────────────────────────
--
-- `introducer_clients.document_request_id` has existed since 20260811 and names
-- applicant 1's request. A joint pack creates TWO requests sharing an
-- application_id, and the second one had nowhere to say where it came from —
-- so a staff member looking at it could not tell it was introducer-originated.
ALTER TABLE document_requests
  ADD COLUMN IF NOT EXISTS introducer_client_id uuid;
CREATE INDEX IF NOT EXISTS document_requests_introducer_client_idx
  ON document_requests (introducer_client_id)
  WHERE introducer_client_id IS NOT NULL;

COMMENT ON COLUMN document_requests.introducer_client_id IS
  'The introducer_clients row whose Tier 2 pack created this request. NULL for staff-created requests.';

-- ── Only a Tier 2 firm may hold a full pack ──────────────────────────────────
--
-- The route checks this too. It is here as well for the reason rule 2 is a
-- trigger rather than route code: the promise is "a Tier 1 introducer cannot do
-- this", and a promise that depends on every future route handler remembering a
-- check is not a promise. A script, a psql session or a route written next year
-- all hit this.
--
-- Reads the firm's CURRENT tier on every write, deliberately. An introducer
-- demoted to t1 stops being able to touch a full pack immediately, rather than
-- keeping the wider authority on packs they started while accredited.
CREATE OR REPLACE FUNCTION introducer_clients_pack_tier_guard() RETURNS trigger AS $$
DECLARE
  firm_tier text;
BEGIN
  IF NEW.pack_type IS DISTINCT FROM 'full' THEN
    RETURN NEW;
  END IF;

  SELECT tier INTO firm_tier FROM introducers WHERE id = NEW.introducer_id;

  -- No tier column yet (this migration running before 20260819 somehow), or no
  -- firm: refuse. An unreadable tier is never read as the wider authority.
  IF firm_tier IS NULL OR firm_tier <> 't2' THEN
    RAISE EXCEPTION
      'introducer % is not accredited at Tier 2 — a full submission pack requires it', NEW.introducer_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS introducer_clients_pack_tier ON introducer_clients;
CREATE TRIGGER introducer_clients_pack_tier
  BEFORE INSERT OR UPDATE OF pack_type, introducer_id ON introducer_clients
  FOR EACH ROW EXECUTE FUNCTION introducer_clients_pack_tier_guard();

-- ── The lock covers the fact find too ────────────────────────────────────────
--
-- introducer_clients_locked_guard() lists the introducer-editable columns one by
-- one, and the 20260811 header warns that a field added to the app's allow-list
-- but not to this list "would be editable after submit without authorisation".
-- `fact_find_data` is exactly such a field, and it is the largest one — the
-- whole financial position. Replaced in full below, adding fact_find_data and
-- pack_type to `changed` and altering nothing else.
--
-- The array_append comment from the original is preserved because the trap it
-- describes is still live: `changed || 'first_name'` dies at runtime inside the
-- BEFORE UPDATE and makes the lock look like it works while blocking every
-- update, including authorised ones.
CREATE OR REPLACE FUNCTION introducer_clients_locked_guard() RETURNS trigger AS $$
DECLARE
  editable_changed boolean;
  active_grant introducer_unlock_grants%ROWTYPE;
  changed text[];
  col text;
  open_fields text[];
  filled_from_blank boolean;
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- array_append, NOT `changed || 'first_name'`. Postgres resolves
  -- `text[] || <unknown literal>` by trying to parse the literal as an ARRAY,
  -- so the concise form dies at runtime with `malformed array literal`. Because
  -- it throws inside a BEFORE UPDATE trigger, the write is rejected -- so the
  -- lock LOOKS like it is working while in fact blocking every update,
  -- including the ones a super admin has authorised. Do not "simplify" this.
  changed := ARRAY[]::text[];
  IF NEW.first_name IS DISTINCT FROM OLD.first_name THEN changed := array_append(changed, 'first_name'); END IF;
  IF NEW.last_name  IS DISTINCT FROM OLD.last_name  THEN changed := array_append(changed, 'last_name');  END IF;
  IF NEW.email      IS DISTINCT FROM OLD.email      THEN changed := array_append(changed, 'email');      END IF;
  IF NEW.phone      IS DISTINCT FROM OLD.phone      THEN changed := array_append(changed, 'phone');      END IF;
  IF NEW.dob        IS DISTINCT FROM OLD.dob        THEN changed := array_append(changed, 'dob');        END IF;
  IF NEW.state      IS DISTINCT FROM OLD.state      THEN changed := array_append(changed, 'state');      END IF;
  IF NEW.suburb     IS DISTINCT FROM OLD.suburb     THEN changed := array_append(changed, 'suburb');     END IF;
  IF NEW.postcode   IS DISTINCT FROM OLD.postcode   THEN changed := array_append(changed, 'postcode');   END IF;
  IF NEW.applicant2_first_name IS DISTINCT FROM OLD.applicant2_first_name THEN changed := array_append(changed, 'applicant2_first_name'); END IF;
  IF NEW.applicant2_last_name  IS DISTINCT FROM OLD.applicant2_last_name  THEN changed := array_append(changed, 'applicant2_last_name');  END IF;
  IF NEW.applicant2_email      IS DISTINCT FROM OLD.applicant2_email      THEN changed := array_append(changed, 'applicant2_email');      END IF;
  IF NEW.applicant2_phone      IS DISTINCT FROM OLD.applicant2_phone      THEN changed := array_append(changed, 'applicant2_phone');      END IF;
  IF NEW.employment_status IS DISTINCT FROM OLD.employment_status THEN changed := array_append(changed, 'employment_status'); END IF;
  IF NEW.income_band       IS DISTINCT FROM OLD.income_band       THEN changed := array_append(changed, 'income_band');       END IF;
  IF NEW.deposit_band      IS DISTINCT FROM OLD.deposit_band      THEN changed := array_append(changed, 'deposit_band');      END IF;
  IF NEW.purchase_intent   IS DISTINCT FROM OLD.purchase_intent   THEN changed := array_append(changed, 'purchase_intent');   END IF;
  IF NEW.timeframe         IS DISTINCT FROM OLD.timeframe         THEN changed := array_append(changed, 'timeframe');         END IF;
  IF NEW.buying_in         IS DISTINCT FROM OLD.buying_in         THEN changed := array_append(changed, 'buying_in');         END IF;
  IF NEW.notes             IS DISTINCT FROM OLD.notes             THEN changed := array_append(changed, 'notes');             END IF;
  -- The Tier 2 additions. `fact_find_data` is the whole financial position, so
  -- leaving it out would make the lock cosmetic for exactly the pack that
  -- carries the most.
  IF NEW.fact_find_data IS DISTINCT FROM OLD.fact_find_data THEN changed := array_append(changed, 'fact_find_data'); END IF;
  IF NEW.pack_type      IS DISTINCT FROM OLD.pack_type      THEN changed := array_append(changed, 'pack_type');      END IF;

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
    -- The fact find and the pack type are never "supply the detail we asked
    -- for" fields. `fact_find_data` defaults to '{}' rather than NULL, so the
    -- blankness test below reads a submitted-but-empty blob as fillable — which
    -- would let an info request seed a whole financial position onto a locked
    -- referral. Excluded explicitly rather than relying on that test.
    IF col IN ('fact_find_data', 'pack_type') THEN
      filled_from_blank := false;
      EXIT;
    END IF;
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
