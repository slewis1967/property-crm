/**
 * Live + GHL-archive contact list, shared by the contacts page (first page)
 * and GET /api/contacts/list ("Load more").
 *
 * The merge (every live contact, then archive contacts with no live twin by
 * email or GHL id) lives in the `contacts_list_v` view
 * (migrations/20260919_contacts_list_view.sql), so a page is one request for
 * pageSize rows plus an exact count. Before the view, both tables were read in
 * full (~14k rows) on every render to show 50 of them.
 *
 * Until that migration is applied, loadContactsPage falls back to the old
 * in-memory merge below, so this code is safe to deploy first. Once the view
 * is live in every environment, the fallback can go.
 */
import { supabase } from "./supabase";
import { log, errInfo } from "./logger";
import type { Contact } from "../app/contacts/ContactsClient";

const PAGE = 1000;
// Hard ceiling so a pathological count can't fan out unbounded requests.
// Far above current volume (~7k live, ~6.5k archive).
const MAX_ROWS = 500_000;

// Only the columns the list view actually renders. The table has ~38
// columns; `select("*")` was dragging a block of unused PII/financial
// fields (income, savings, DOB, addresses) AND the free-text `notes`
// blob into memory + the RSC payload for ~7k rows every render.
// `notes` is deliberately NOT fetched: ContactsClient never renders it
// (clicking a row routes to /contacts/[id], which owns the notes view).
const LIVE_COLUMNS =
  "id,created_at,updated_at,name,full_name,first_name,email,phone," +
  "buyer_type,state,preferred_state,budget,budget_min,budget_max," +
  "finance_status,timeframe,lead_score,temperature,status,source," +
  "ghl_contact_id,tags";

const ARCHIVE_COLUMNS =
  "id,contact_name,first_name,last_name,email,phone,type,source,state,country,date_added,tags";

interface ArchiveRow {
  id: string;
  contact_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
  source: string | null;
  state: string | null;
  country: string | null;
  date_added: string | null;
  tags: string[] | null;
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

/**
 * Read every row of a query: page 1 with an exact count, then all remaining
 * pages concurrently. `fetchPage` must apply a total order (unique tiebreak)
 * so concurrent ranges neither overlap nor skip rows.
 */
async function drain<T>(
  fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const first = await fetchPage(0, PAGE - 1, true);
  if (first.error) throw first.error;
  const rows = [...(first.data ?? [])];
  const total = Math.min(first.count ?? rows.length, MAX_ROWS);
  const rest: PromiseLike<PageResult<T>>[] = [];
  for (let from = PAGE; from < total; from += PAGE) {
    rest.push(fetchPage(from, from + PAGE - 1, false));
  }
  for (const page of await Promise.all(rest)) {
    if (page.error) throw page.error;
    rows.push(...(page.data ?? []));
  }
  return rows;
}

function loadLive(): Promise<Contact[]> {
  return drain<Contact>((from, to, withCount) =>
    supabase
      .from("contacts")
      .select(LIVE_COLUMNS, withCount ? { count: "exact" } : undefined)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<Contact[], { merge: false }>(),
  );
}

async function loadArchive(): Promise<ArchiveRow[]> {
  try {
    return await drain<ArchiveRow>((from, to, withCount) =>
      supabase
        .from("ghl_archive_contacts")
        .select(ARCHIVE_COLUMNS, withCount ? { count: "exact" } : undefined)
        .order("date_added", { ascending: false, nullsFirst: false })
        // Tiebreak: pages are fetched concurrently, so the order must be total.
        .order("id", { ascending: true })
        .range(from, to)
        .overrideTypes<ArchiveRow[], { merge: false }>(),
    );
  } catch (e) {
    // The archive is a nice-to-have; the live list still renders without it.
    log.warn("contacts.archive_fetch_failed", errInfo(e));
    return [];
  }
}

function mergeLiveAndArchive(live: Contact[], archive: ArchiveRow[]): Contact[] {
  // Dedupe live by id — a row updated mid-read can move between pages.
  const seen = new Set<string>();
  const dedupedLive: Contact[] = [];
  const liveEmails = new Set<string>();
  const liveGhlIds = new Set<string>();
  for (const c of live) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    dedupedLive.push(c);
    if (c.email) liveEmails.add(String(c.email).toLowerCase());
    if (c.ghl_contact_id) liveGhlIds.add(c.ghl_contact_id);
  }

  const archiveOnly: Contact[] = [];
  for (const a of archive) {
    const aEmailLc = a.email ? String(a.email).toLowerCase() : null;
    if (aEmailLc && liveEmails.has(aEmailLc)) continue;
    if (liveGhlIds.has(a.id)) continue;
    const name =
      a.contact_name || `${a.first_name || ""} ${a.last_name || ""}`.trim() || null;
    archiveOnly.push({
      id: a.id,
      created_at: a.date_added || null,
      updated_at: a.date_added || null,
      name,
      full_name: a.contact_name || null,
      first_name: a.first_name || null,
      email: a.email || null,
      phone: a.phone || null,
      buyer_type: a.type || null,
      state: a.state || null,
      preferred_state: a.state || null,
      budget: null,
      budget_min: null,
      budget_max: null,
      finance_status: null,
      timeframe: null,
      lead_score: null,
      temperature: null,
      status: "archive",
      source: a.source || null,
      ghl_contact_id: a.id,
      tags: Array.isArray(a.tags) ? [...a.tags, "ghl-archive"] : ["ghl-archive"],
      notes: null,
    });
  }

  return [...dedupedLive, ...archiveOnly];
}

async function loadMergedContacts(): Promise<Contact[]> {
  const [live, archive] = await Promise.all([loadLive(), loadArchive()]);
  return mergeLiveAndArchive(live, archive);
}

// Table-level "doesn't exist" codes only, like factFindsTableMissing(): a
// column error must surface, not quietly fall back to the slow path.
function viewMissing(e: { code?: string } | null): boolean {
  return e?.code === "42P01" || e?.code === "PGRST205";
}

/**
 * One page of the list (1-based) and the total across all pages: every live
 * contact (most recently updated first) followed by the archive contacts that
 * have no live counterpart by email or GHL id. Throws if it can't be read.
 */
export async function loadContactsPage(
  page: number,
  pageSize: number,
): Promise<{ rows: Contact[]; total: number }> {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("contacts_list_v")
    .select(LIVE_COLUMNS, { count: "exact" })
    .order("list_group", { ascending: true })
    .order("null_rank", { ascending: true })
    .order("sort_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1)
    .overrideTypes<Contact[], { merge: false }>();

  if (!error) return { rows: data ?? [], total: count ?? 0 };
  if (!viewMissing(error)) throw error;

  log.warn("contacts.list_view_missing", {
    detail: "contacts_list_v not found — apply migrations/20260919_contacts_list_view.sql; using the full in-memory merge",
  });
  const merged = await loadMergedContacts();
  return { rows: merged.slice(from, from + pageSize), total: merged.length };
}
