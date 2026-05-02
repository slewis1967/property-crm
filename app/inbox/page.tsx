import Link from "next/link";
import { supabase } from "../../utils/supabase";

export const dynamic = "force-dynamic";

type EmailRow = {
  id: string;
  direction: string;
  to_email: string;
  from_email: string;
  from_name: string | null;
  subject: string;
  status: string;
  contact_id: string | null;
  message_id: string | null;
  thread_id: string | null;
  sent_at: string | null;
  created_at: string;
};

type Thread = {
  thread_id: string;
  subject: string;
  messages: EmailRow[];
  latest_at: string;
  has_inbound: boolean;
  has_outbound: boolean;
  contact_id: string | null;
  unread_inbound: number;
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter ?? "all"; // all | inbound | outbound | unread

  const { data: rows } = await supabase
    .from("email_log")
    .select("id,direction,to_email,from_email,from_name,subject,status,contact_id,message_id,thread_id,sent_at,created_at")
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
        <p className="text-gray-500 text-sm mt-1">All email threads — inbound replies + outbound sends</p>
      </div>

      <div className="flex gap-2 mb-5">
        <FilterPill href="/inbox" active={filter === "all"} label={`All (${counts.all})`} />
        <FilterPill href="/inbox?filter=inbound" active={filter === "inbound"} label={`📥 Inbound (${counts.inbound})`} />
        <FilterPill href="/inbox?filter=outbound" active={filter === "outbound"} label={`📤 Outbound only (${counts.outbound})`} />
        <FilterPill href="/inbox?filter=unread" active={filter === "unread"} label={`🔵 Unread inbound (${counts.unread})`} />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No threads match this filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-2 px-4 text-gray-500 font-medium w-8"></th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Thread</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Contact</th>
                <th className="text-right py-2 px-4 text-gray-500 font-medium">Messages</th>
                <th className="text-right py-2 px-4 text-gray-500 font-medium whitespace-nowrap">Latest</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const contactName = t.contact_id ? contactNames[t.contact_id] : null;
                const latest = t.messages[t.messages.length - 1];
                const dirIcon = t.has_inbound && t.has_outbound ? "🔄" : t.has_inbound ? "📥" : "📤";
                return (
                  <tr key={t.thread_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4 text-center">{dirIcon}</td>
                    <td className="py-2 px-4">
                      <p className="font-medium truncate max-w-md">{t.subject}</p>
                      {latest && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">
                          {latest.direction === "inbound" ? "from" : "to"}{" "}
                          {latest.direction === "inbound" ? latest.from_email : latest.to_email}
                        </p>
                      )}
                    </td>
                    <td className="py-2 px-4">
                      {t.contact_id && contactName ? (
                        <Link href={`/contacts/${t.contact_id}`} className="text-blue-600 hover:underline">
                          {contactName}
                        </Link>
                      ) : (
                        <span className="text-gray-400 text-xs">unmatched</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right text-xs text-gray-600">
                      {t.messages.length}
                      {t.unread_inbound > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                          {t.unread_inbound} new
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right text-xs text-gray-500 whitespace-nowrap">
                      {fmtDateTime(t.latest_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-4">
        Showing the most recent 300 emails grouped into threads. Click a contact name to open their detail page where the full thread expands inline.
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
    // "Unread" heuristic: inbound message arrived AFTER the most recent outbound.
    // Refined further by status='received' and no later outbound.
  }
  for (const t of map.values()) {
    t.messages.sort((a, b) => (a.sent_at ?? a.created_at).localeCompare(b.sent_at ?? b.created_at));
    // Recompute unread_inbound: inbound rows AFTER the latest outbound row.
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

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.valueOf())) return s;
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}
