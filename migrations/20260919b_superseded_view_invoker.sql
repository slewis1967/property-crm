-- APPLIED to production 19 Sep 2026 (supabase db push, version
-- 20260919010000). Committed here so the migrations folder matches the
-- database. Safe to re-run.
--
-- v_superseded_sync_rows (the feed clean-up helper from 11 Sep, see
-- docs/memory feed-cleanup-2026-09-11) was created as a plain view, which
-- runs with its owner's rights and bypasses global_stock_pool's RLS. The
-- browser anon key could read all of it through PostgREST: 78 rows of
-- supplier names, suburbs and the replacing builder/estate, the supplier
-- identity the partner portal deliberately masks. Supabase's advisor flagged
-- it CRITICAL (security_definer_view).
--
-- It is read only with the service role (bypasses RLS) and by no app code, so
-- running it with the caller's rights and dropping the public grants changes
-- nothing for its real users.
--
-- Any new view in this project should be created WITH (security_invoker = true).
alter view public.v_superseded_sync_rows set (security_invoker = true);
revoke all on public.v_superseded_sync_rows from anon, authenticated;
