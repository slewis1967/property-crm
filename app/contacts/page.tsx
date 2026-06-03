import { cookies } from "next/headers";
import { supabase } from "../../utils/supabase";
import { log, errInfo } from "../../utils/logger";
import ContactsClient, { type Contact } from "./ContactsClient";
import { ALLOWED_PAGE_SIZES, DEFAULT_PAGE_SIZE, type PageSize } from "../../utils/pagination";

export const dynamic = "force-dynamic";

// Only the columns the list view actually renders. The table has ~38
// columns; `select("*")` was dragging a block of unused PII/financial
// fields (income, savings, DOB, addresses) AND the free-text `notes`
// blob into memory + the RSC payload for ~7k rows every render, tipping
// the cold-start render past Netlify's 10s function timeout.
//
// `notes` is deliberately NOT fetched here: ContactsClient never renders
// it (clicking a row routes to /contacts/[id], whose page does its own
// select("*") and owns the notes view/edit). Keeping it out of the list
// payload is the single biggest remaining size win, with zero behaviour
// change. Don't add it back without moving the notes UI into the list.
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

const PAGE = 1000;
// Hard ceiling so a pathological pagination can't loop forever / OOM the
// function. Far above current volume (~7k live, ~6.5k archive).
const MAX_ROWS = 500_000;

async function loadLive(): Promise<{ contacts: Contact[]; error: string | null }> {
  const rows: Contact[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from("contacts")
      .select(LIVE_COLUMNS)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { contacts: rows, error: error.message };
    rows.push(...((data as unknown as Contact[]) ?? []));
    if (!data || data.length < PAGE) break;
  }
  // Dedupe by id — pagination overlap is possible on non-unique updated_at.
  const seen = new Set<string>();
  const deduped: Contact[] = [];
  for (const c of rows) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    deduped.push(c);
  }
  return { contacts: deduped, error: null };
}

async function loadArchive(): Promise<ArchiveRow[]> {
  const rows: ArchiveRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from("ghl_archive_contacts")
      .select(ARCHIVE_COLUMNS)
      .order("date_added", { ascending: false, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (error) {
      log.warn("contacts.archive_fetch_failed", errInfo(error));
      break;
    }
    rows.push(...((data as unknown as ArchiveRow[]) ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function mergeIntoArchiveOnly(
  archiveRows: ArchiveRow[],
  liveEmails: Set<string>,
  liveGhlIds: Set<string>,
): Contact[] {
  const archiveOnly: Contact[] = [];
  for (const a of archiveRows) {
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
  return archiveOnly;
}

/**
 * Read the user's preferred page size from cookies so the server
 * component's first render matches the dropdown. Falls back to
 * DEFAULT_PAGE_SIZE if the cookie is missing or invalid.
 */
async function pageSizeFromCookies(): Promise<PageSize> {
  try {
    const jar = await cookies();
    const raw = jar.get("contacts_pageSize")?.value;
    if (raw) {
      const n = Number(raw);
      if ((ALLOWED_PAGE_SIZES as readonly number[]).includes(n)) return n as PageSize;
    }
  } catch {
    // cookies() throws if called outside a request context.
  }
  return DEFAULT_PAGE_SIZE;
}

export default async function ContactsPage() {
  const pageSize = await pageSizeFromCookies();

  // Live + archive are independent fetches. Previously they ran
  // sequentially (fully drain live, THEN fully drain archive), which
  // roughly doubled cold-start wall-clock. Run them concurrently and do
  // the in-memory anti-join (drop archive rows that have a live
  // counterpart) once both are in.
  const [live, archiveRows] = await Promise.all([loadLive(), loadArchive()]);

  if (live.error) {
    return <div className="text-red-600 p-4">Error loading contacts: {live.error}</div>;
  }

  const liveEmails = new Set<string>();
  const liveGhlIds = new Set<string>();
  for (const c of live.contacts) {
    if (c.email) liveEmails.add(String(c.email).toLowerCase());
    if (c.ghl_contact_id) liveGhlIds.add(c.ghl_contact_id);
  }

  const archiveOnly = mergeIntoArchiveOnly(archiveRows, liveEmails, liveGhlIds);
  const merged = [...live.contacts, ...archiveOnly];
  const total = merged.length;
  const firstPage = merged.slice(0, pageSize);

  return (
    <ContactsClient
      initialContacts={firstPage}
      initialTotal={total}
      initialPageSize={pageSize}
    />
  );
}
