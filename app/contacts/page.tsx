import { supabase } from "../../utils/supabase";
import ContactsClient from "./ContactsClient";

export const dynamic = "force-dynamic";

const PAGE = 1000;

async function fetchAll(table: string, columns = "*") {
  const out: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("updated_at" in {} ? "updated_at" : "id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export default async function ContactsPage() {
  let contacts: any[] = [];
  let from = 0;

  // Live contacts (existing CRM rows)
  while (true) {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      return <div className="text-red-600 p-4">Error loading contacts: {error.message}</div>;
    }

    contacts = contacts.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }

  // Dedupe live by id (pagination overlap on non-unique updated_at)
  const seenIds = new Set<string>();
  contacts = contacts.filter(c => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  // Build the set of emails already in live contacts (case-insensitive) so we
  // don't show GHL-archive duplicates of contacts that exist live.
  const liveEmails = new Set<string>();
  // Also track ghl_contact_id links so an archive contact already linked to a
  // live one doesn't get added a second time.
  const liveGhlIds = new Set<string>();
  for (const c of contacts) {
    if (c.email) liveEmails.add(String(c.email).toLowerCase());
    if (c.ghl_contact_id) liveGhlIds.add(c.ghl_contact_id);
  }

  // Fetch archive contacts and append the ones with no live counterpart
  let archiveFrom = 0;
  const archiveOnly: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("ghl_archive_contacts")
      .select("id,contact_name,first_name,last_name,email,phone,type,source,state,country,date_added,tags")
      .order("date_added", { ascending: false, nullsFirst: false })
      .range(archiveFrom, archiveFrom + PAGE - 1);
    if (error) break;
    for (const a of data || []) {
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
    if (!data || data.length < PAGE) break;
    archiveFrom += PAGE;
  }

  return <ContactsClient initialContacts={[...contacts, ...archiveOnly]} />;
}
