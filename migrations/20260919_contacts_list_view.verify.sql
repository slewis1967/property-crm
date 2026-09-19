-- Verification for 20260919_contacts_list_view.sql.
--
-- Run AFTER the migration. Rolls itself back, so it is safe to run twice; it is
-- not safe against production because it writes rows before undoing them.
-- (Production equivalence is proved separately: the view is diffed against the
-- JS merge it replaces over the real tables, read-only.)

BEGIN;

DO $$
DECLARE
  n  integer;
  r  record;
  ids text;
BEGIN
  -- 1. security_invoker is on. Without it the view runs as its owner and
  --    publishes every contact through PostgREST to the browser anon key.
  SELECT count(*) INTO n FROM pg_class
   WHERE relname = 'contacts_list_v'
     AND 'security_invoker=true' = ANY (reloptions);
  IF n <> 1 THEN RAISE EXCEPTION '1 FAIL contacts_list_v is not security_invoker'; END IF;
  RAISE NOTICE '1 OK  the view runs with the caller''s rights, so base-table RLS applies';

  -- 2. anon cannot select it at all.
  IF has_table_privilege('anon', 'public.contacts_list_v', 'SELECT') THEN
    RAISE EXCEPTION '2 FAIL anon can select contacts_list_v';
  END IF;
  RAISE NOTICE '2 OK  anon has no SELECT on the view';

  -- Fixture. Live: L1 (email a@x), L2 (ghl id G2), L3 (no email, NULL updated_at).
  INSERT INTO contacts (id, name, email, ghl_contact_id, updated_at) VALUES
    ('00000000-0000-0000-0000-0000000000a1', 'L1', 'A@X.com', NULL,  now() - interval '1 day'),
    ('00000000-0000-0000-0000-0000000000a2', 'L2', '',        'G2',  now()),
    ('00000000-0000-0000-0000-0000000000a3', 'L3', NULL,      NULL,  NULL);
  -- Archive: G1 dup by email (case-insensitive) -> dropped; G2 dup by ghl id ->
  -- dropped; G3 empty email -> kept (empty never matches the live '' email);
  -- G4 NULL date -> kept, last; G5 jsonb array tags; G6 jsonb object tags.
  INSERT INTO ghl_archive_contacts (id, contact_name, first_name, last_name, email, date_added, tags) VALUES
    ('G1', 'Dup Email', NULL, NULL, 'a@x.COM', now(),                      '["x"]'),
    ('G2', 'Dup Ghl',   NULL, NULL, 'g2@x.com', now(),                     NULL),
    ('G3', '',          'Ann', 'Lee', '',       now() - interval '2 days', NULL),
    ('G4', 'No Date',   NULL, NULL, 'g4@x.com', NULL,                      NULL),
    ('G5', 'Arr Tags',  NULL, NULL, 'g5@x.com', now() - interval '1 day',  '["vip","qld"]'),
    ('G6', 'Obj Tags',  NULL, NULL, 'g6@x.com', now() - interval '3 days', '{"k":"v"}');

  -- 3. Membership: the two duplicates are gone, everything else is present.
  SELECT string_agg(id, ',' ORDER BY list_group, null_rank, sort_at DESC, id) INTO ids
    FROM contacts_list_v;
  IF ids <> '00000000-0000-0000-0000-0000000000a3,00000000-0000-0000-0000-0000000000a2,00000000-0000-0000-0000-0000000000a1,G5,G3,G6,G4' THEN
    RAISE EXCEPTION '3 FAIL membership/order is %', ids;
  END IF;
  RAISE NOTICE '3 OK  archive rows with a live email or ghl-id twin are dropped; order is live (NULL first) then archive (NULL last)';

  -- 4. Empty contact_name falls back to first + last, like the JS `||` chain.
  SELECT * INTO r FROM contacts_list_v WHERE id = 'G3';
  IF r.name IS DISTINCT FROM 'Ann Lee' OR r.full_name IS NOT NULL OR r.email IS NOT NULL THEN
    RAISE EXCEPTION '4 FAIL G3 mapped to name=% full_name=% email=%', r.name, r.full_name, r.email;
  END IF;
  RAISE NOTICE '4 OK  empty strings become NULL and the name falls back to first + last';

  -- 5. Tags: a jsonb array keeps its elements plus ghl-archive; anything else
  --    is just ghl-archive.
  SELECT tags::text INTO ids FROM contacts_list_v WHERE id = 'G5';
  IF ids <> '{vip,qld,ghl-archive}' THEN RAISE EXCEPTION '5 FAIL G5 tags %', ids; END IF;
  SELECT tags::text INTO ids FROM contacts_list_v WHERE id = 'G6';
  IF ids <> '{ghl-archive}' THEN RAISE EXCEPTION '5 FAIL G6 tags %', ids; END IF;
  RAISE NOTICE '5 OK  archive tags convert from jsonb and gain ghl-archive';

  -- 6. Archive rows read as status 'archive' and carry their id as ghl_contact_id.
  SELECT count(*) INTO n FROM contacts_list_v
   WHERE list_group = 1 AND (status <> 'archive' OR ghl_contact_id <> id);
  IF n <> 0 THEN RAISE EXCEPTION '6 FAIL % archive rows mis-mapped', n; END IF;
  RAISE NOTICE '6 OK  archive rows are marked archive and keep their GHL id';
END $$;

ROLLBACK;
