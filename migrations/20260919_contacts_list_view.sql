-- contacts_list_v — the Contacts list (live contacts + GHL-archive-only
-- contacts) as one pageable relation.
--
-- The Contacts page and GET /api/contacts/list used to read BOTH tables in
-- full (~14k rows, 1,000 per request) on every render just to show 50 rows,
-- because the "drop archive rows that have a live counterpart" rule ran in
-- JavaScript. Doing the merge here lets them ask for one page plus an exact
-- count in a single request.
--
-- Must stay row-for-row identical to the JS merge it replaces
-- (utils/contacts-list.ts, mergeLiveAndArchive):
--   * every live contact, most recently updated first (NULL updated_at first —
--     PostgREST's `.desc` is Postgres DESC, which puts NULLs first), then id;
--   * then each archive contact with NO live row sharing its email
--     (case-insensitive, empty emails never match) and NO live row whose
--     ghl_contact_id is its id, newest date_added first (NULLs last), then id;
--   * JS `x || null` turns '' into null, hence the nullif()s;
--   * archive tags are jsonb: an array keeps its elements plus 'ghl-archive',
--     anything else becomes just ['ghl-archive'].
--
-- Order with: list_group.asc, null_rank.asc, sort_at.desc, id.asc
--
-- security_invoker: the view runs with the CALLER's rights, so the base tables'
-- RLS (default-deny) still applies to anon/authenticated. Without it a view
-- runs as its owner and would publish every contact through PostgREST to
-- anyone holding the browser anon key. The grants are a second belt.

create or replace view public.contacts_list_v
with (security_invoker = true) as
select
  c.id::text                    as id,
  c.created_at,
  c.updated_at,
  c.name,
  c.full_name,
  c.first_name,
  c.email,
  c.phone,
  c.buyer_type,
  c.state,
  c.preferred_state,
  c.budget,
  c.budget_min,
  c.budget_max,
  c.finance_status,
  c.timeframe,
  c.lead_score,
  c.temperature,
  c.status,
  c.source,
  c.ghl_contact_id,
  c.tags,
  0                             as list_group,
  case when c.updated_at is null then 0 else 1 end as null_rank,
  c.updated_at                  as sort_at
from public.contacts c

union all

select
  a.id,
  a.date_added,
  a.date_added,
  coalesce(
    nullif(a.contact_name, ''),
    nullif(trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '')
  ),
  nullif(a.contact_name, ''),
  nullif(a.first_name, ''),
  nullif(a.email, ''),
  nullif(a.phone, ''),
  nullif(a.type, ''),
  nullif(a.state, ''),
  nullif(a.state, ''),
  null::numeric,
  null::integer,
  null::integer,
  null::text,
  null::text,
  null::integer,
  null::text,
  'archive'::text,
  nullif(a.source, ''),
  a.id,
  case
    when jsonb_typeof(a.tags) = 'array'
      then array(select jsonb_array_elements_text(a.tags)) || array['ghl-archive']
    else array['ghl-archive']
  end,
  1,
  case when a.date_added is null then 2 else 1 end,
  a.date_added
from public.ghl_archive_contacts a
where not exists (
        select 1 from public.contacts c
         where c.ghl_contact_id = a.id)
  and (coalesce(a.email, '') = ''
       or not exists (
        select 1 from public.contacts c
         where c.email <> ''
           and lower(c.email) = lower(a.email)));

revoke all on public.contacts_list_v from anon, authenticated;
grant select on public.contacts_list_v to service_role;
