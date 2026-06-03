/**
 * GET /api/contacts/list?page=N&pageSize=M
 *
 * Paginated list of live + archive contacts.
 *
 * Why this exists:
 *   The contacts page used to load every row from `contacts` and
 *   `ghl_archive_contacts` (up to ~13.5k rows combined) in the
 *   server component and ship them all to the browser. Cold starts
 *   were tipping past Netlify's 10s budget. This endpoint serves
 *   the first page from the server component and the rest via
 *   "Load more" calls.
 *
 * Page numbers start at 1. Page size is pinned to 25/50/75/100.
 * The list keeps the same live+archive merge + dedup logic the
 * page component used to run, so the UI can't tell the difference
 * between "initial render" and "load more" rows.
 *
 * Auth: sentinel pattern (same as /api/properties/list). Unauth
 * callers get a 401, not a leaked page of contacts.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../utils/cf-access";
import { withObservability } from "../../../../utils/observability";
import {
  coercePage,
  coercePageSize,
  paginate,
  type PageSize,
} from "../../../../utils/pagination";
import { log, errInfo } from "../../../../utils/logger";
import type { Contact } from "../../../contacts/ContactsClient";

export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_ROWS = 500_000;

// Only the columns the list view actually renders. The full contacts
// table has ~38 columns; select("*") was dragging income, savings,
// DOB, addresses + the free-text notes blob into every render. The
// detail page owns the rest. Mirror the projection in page.tsx.
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

async function loadLivePage(from: number, to: number) {
  return supabase
    .from("contacts")
    .select(LIVE_COLUMNS)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);
}

async function loadArchivePage(from: number, to: number) {
  return supabase
    .from("ghl_archive_contacts")
    .select(ARCHIVE_COLUMNS)
    .order("date_added", { ascending: false, nullsFirst: false })
    .range(from, to);
}

/**
 * Load the full live + archive sets so we can dedup archive rows
 * that have a live counterpart. This is the same logic page.tsx
 * ran; we keep it here so the API is the only source of truth for
 * "what contacts exist" and the page can stay a thin shell.
 *
 * Note: this still drains the tables in the same 1k-paginated way
 * the page used to. The win is the per-request response — we only
 * serialise the slice the user actually asked for, not 13.5k rows.
 */
async function loadAll(): Promise<{ live: Contact[]; archive: ArchiveRow[] }> {
  const live: Contact[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await loadLivePage(from, from + PAGE - 1);
    if (error) throw error;
    live.push(...((data as unknown as Contact[]) ?? []));
    if (!data || data.length < PAGE) break;
  }

  const archive: ArchiveRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await loadArchivePage(from, from + PAGE - 1);
    if (error) {
      log.warn("contacts.list.archive_fetch_failed", errInfo(error));
      break;
    }
    archive.push(...((data as unknown as ArchiveRow[]) ?? []));
    if (!data || data.length < PAGE) break;
  }

  return { live, archive };
}

function mergeLiveAndArchive(live: Contact[], archive: ArchiveRow[]): Contact[] {
  const liveEmails = new Set<string>();
  const liveGhlIds = new Set<string>();
  for (const c of live) {
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

  // Dedupe live by id (the order-by updated_at isn't unique, so
  // pagination on the load side can produce overlap).
  const seen = new Set<string>();
  const dedupedLive: Contact[] = [];
  for (const c of live) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    dedupedLive.push(c);
  }

  return [...dedupedLive, ...archiveOnly];
}

async function handler(req: Request) {
  const sender = await userEmailFromRequest(req);
  if (sender === "__unauthenticated__@invalid") {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = coercePage(url.searchParams.get("page"));
  const pageSize = coercePageSize(url.searchParams.get("pageSize")) as PageSize;

  const { live, archive } = await loadAll();
  const merged = mergeLiveAndArchive(live, archive);

  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const slice = merged.slice(from, to);

  return NextResponse.json(paginate(slice, page, pageSize, merged.length));
}

export const GET = withObservability("GET /api/contacts/list", handler);
