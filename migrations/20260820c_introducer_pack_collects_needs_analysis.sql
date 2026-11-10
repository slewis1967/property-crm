-- The pack collects the Needs Analysis itself, rather than deriving it.
--
-- Follow-up to 20260820_introducer_tier2_pack.sql and 20260820b, both already
-- applied in production and neither to be edited.
--
-- WHAT WAS WRONG WITH DERIVING IT. 20260820b had the pack collect a Borrower
-- Fact Find and machine-translate it into the Needs Analysis at submit, via
-- factFindToNeedsAnalysis. That function is explicit that it produces a
-- REVIEWABLE DRAFT — "a wrong carried-over value is worse than a blank one" —
-- and it emits a note for every assumption it had to make: income carried at an
-- unconfirmed frequency, a home address dropped whole into the street line
-- because the Fact Find never split suburb from state.
--
-- The client was then emailed that draft to SIGN. So the document YLA receive as
-- the primary compliance artefact carried acknowledged guesses, over a real
-- signature. That is the wrong way round.
--
-- It also lost information that only exists on the Needs Analysis. Employer name
-- and address, employment basis, employment start date and pay frequency have no
-- Fact Find equivalent — and those are exactly the fields the income
-- reconciliation needs for its employer-match and part-year findings. A derived
-- pack was silently exempt from both.
--
-- SO THE DIRECTION REVERSES. The introducer completes the Needs Analysis, which
-- is the document the client signs and YLA receive. Nothing is machine-derived
-- into a signed artefact.
--
-- NO FACT FIND IS CREATED AT SUBMIT, deliberately. needsAnalysisToFactFind maps
-- applicants only — it says so in its own notes: "Assets, liabilities,
-- securities and disclosures were not copied". Writing that to
-- borrower_fact_finds would put a half-empty compliance document in the CRM that
-- nobody filled in and nobody signed, which is worse than none: someone will
-- open it and believe it. Staff already have a one-click "populate from Needs
-- Analysis" path (/api/fact-finds/na-seed, keyed on contact_id, which a pack now
-- sets), so the broker route stays one click away without the litter.
--
-- Idempotent.

-- The Needs Analysis as the introducer is filling it in.
--
-- Same posture as `fact_find_data` beside it: held here while it is being
-- written, promoted to a real `nccp_needs_analyses` row at submit. A half-typed
-- document belonging to a pack nobody has submitted does not belong in the table
-- the CRM lists, the packager reads and compliance treats as real.
--
-- SAME SHAPE, ONE SCHEMA. This is `NeedsAnalysisData` verbatim, so the promotion
-- is a copy and not a translation. Do not add introducer-only keys to it.
ALTER TABLE introducer_clients
  ADD COLUMN IF NOT EXISTS needs_analysis_data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN introducer_clients.needs_analysis_data IS
  'utils/needsAnalysis.ts NeedsAnalysisData, identical to nccp_needs_analyses.data. '
  'Promoted to a real row at submit, then signed by the client and sent to YLA.';

-- `fact_find_data` is left in place and still guarded below. Packs created
-- before this migration hold one, and dropping the column would take their
-- contents with it. Nothing writes it any more.
COMMENT ON COLUMN introducer_clients.fact_find_data IS
  'SUPERSEDED by needs_analysis_data. Retained for packs created before '
  '20260820c; nothing writes it now. YLA receive the Needs Analysis, not this.';

-- ── The lock covers it ───────────────────────────────────────────────────────
--
-- Same reasoning as `fact_find_data` in 20260820: this is the whole financial
-- position, it is the largest thing an introducer supplies, and a lock that does
-- not cover it is cosmetic for exactly the pack that carries the most. Replaced
-- in full below, adding `needs_analysis_data` to `changed` and altering nothing
-- else.
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
  -- The Tier 2 documents. `needs_analysis_data` is what the client signs and
  -- what YLA receive, so it is the single most important thing on this row to
  -- hold still after submit. `fact_find_data` stays guarded for packs that
  -- predate 20260820c.
  IF NEW.fact_find_data      IS DISTINCT FROM OLD.fact_find_data      THEN changed := array_append(changed, 'fact_find_data');      END IF;
  IF NEW.needs_analysis_data IS DISTINCT FROM OLD.needs_analysis_data THEN changed := array_append(changed, 'needs_analysis_data'); END IF;
  IF NEW.pack_type           IS DISTINCT FROM OLD.pack_type           THEN changed := array_append(changed, 'pack_type');           END IF;

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
    -- The documents and the pack type are never "supply the detail we asked
    -- for" fields. Both jsonb columns default to '{}' rather than NULL, so the
    -- blankness test below reads a submitted-but-empty blob as fillable — which
    -- would let an info request seed a whole financial position, or a whole
    -- signed-document-to-be, onto a locked pack. Excluded explicitly.
    IF col IN ('fact_find_data', 'needs_analysis_data', 'pack_type') THEN
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
