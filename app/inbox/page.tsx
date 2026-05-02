import Link from "next/link";
import { supabase } from "../../utils/supabase";
import InboxTable, { type EmailRow, type Thread } from "./InboxTable";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter ?? "all"; // all | inbound | outbound | unread

  const { data: rows } = await supabase
    .from("email_log")
    .select("id,direction,to_email,to_name,from_email,from_name,subject,body_html,status,contact_id,message_id,thread_id,sent_at,created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  const all: EmailRow[] = rows ?? [];

  // Build a contact-name lookup
  const contactIds = Array.from(new Set(all.map((e) => e.contact_id).filter(Boolean))) as string[];
  let contactNames: Record<string, string> = {};
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id,name,full_name,email")
      .in("id", contactIds);
    if (contacts) {
      contactNames = Object.fromEntries(
        contacts.map((c) => [c.id, (c.full_name || c.name || c.email || "(unnamed)") as string]),
      );
    }
  }

  const threads = groupIntoThreads(all);

  const filtered = threads.filter((t) => {
    if (filter === "inbound") return t.has_inbound;
    if (filter === "outbound") return t.has_outbound && !t.has_inbound;
    if (filter === "unread") return t.unread_inbound > 0;
    return true;
  });

  const counts = {
    all: threads.length,
    inbound: threads.filter((t) => t.has_inbound).length,
    outbound: threads.filter((t) => t.has_outbound && !t.has_inbound).length,
    unread: threads.filter((t) => t.unread_inbound > 0).length,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Inbox</h1>
        <p className="text-gray-500 text-sm mt-1">All email threads — click any row to expand the conversation</p>
      </div>

      <div className="flex gap-2 mb-5">
        <FilterPill href="/inbox" active={filter === "all"} label={`All (${counts.all})`} />
        <FilterPill href="/inbox?filter=inbound" active={filter === "inbound"} label={`📥 Inbound (${counts.inbound})`} />
        <FilterPill href="/inbox?filter=outbound" active={filter === "outbound"} label={`📤 Outbound only (${counts.outbound})`} />
        <FilterPill href="/inbox?filter=unread" active={filter === "unread"} label={`🔵 Unread inbound (${counts.unread})`} />
      </div>

      <InboxTable threads={filtered} contactNames={contactNames} />

      <p className="text-[11px] text-gray-400 mt-4">
        Showing the most recent 300 emails grouped into threads. Click a contact name to jump to their detail page where you can reply with full context.
      </p>
    </div>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  const cls = active
    ? "bg-gray-900 text-white"
    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50";
  return (
    <Link href={href} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${cls}`}>
      {label}
    </Link>
  );
}

function groupIntoThreads(emails: EmailRow[]): Thread[] {
  const map = new Map<string, Thread>();
  for (const e of emails) {
    const key = e.thread_id || e.message_id || e.id;
    if (!map.has(key)) {
      map.set(key, {
        thread_id: key,
        subject: stripReplyPrefix(e.subject),
        messages: [],
        latest_at: e.sent_at ?? e.created_at,
        has_inbound: false,
        has_outbound: false,
        contact_id: e.contact_id,
        unread_inbound: 0,
      });
    }
    const t = map.get(key)!;
    t.messages.push(e);
    if (e.direction === "inbound") t.has_inbound = true;
    if (e.direction === "outbound") t.has_outbound = true;
    if (!t.contact_id && e.contact_id) t.contact_id = e.contact_id;
    const ts = e.sent_at ?? e.created_at;
    if (ts > t.latest_at) t.latest_at = ts;
  }
  for (const t of map.values()) {
    t.messages.sort((a, b) => (a.sent_at ?? a.created_at).localeCompare(b.sent_at ?? b.created_at));
    const lastOutbound = t.messages.filter((m) => m.direction === "outbound").pop();
    const cutoff = lastOutbound ? (lastOutbound.sent_at ?? lastOutbound.created_at) : "";
    t.unread_inbound = t.messages.filter(
      (m) => m.direction === "inbound" && (m.sent_at ?? m.created_at) > cutoff,
    ).length;
  }
  const list = Array.from(map.values());
  list.sort((a, b) => b.latest_at.localeCompare(a.latest_at));
  return list;
}

function stripReplyPrefix(subject: string): string {
  return subject.replace(/^(re:|fwd:|fw:)\s+/i, "").trim() || subject;
}
