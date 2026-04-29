import { supabase } from "../../../utils/supabase";
import { ArchiveHeader, SearchBar, Pager, EmptyState, fmtDateTime, truncate, stripHtml } from "../_lib";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const typeColor = (t: string | null) => {
  if (!t) return "bg-gray-100 text-gray-600";
  if (t.toLowerCase().includes("sms")) return "bg-green-100 text-green-700";
  if (t.toLowerCase().includes("email")) return "bg-blue-100 text-blue-700";
  if (t.toLowerCase().includes("call")) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-600";
};

export default async function ArchiveConversations({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1"));

  let query = supabase
    .from("ghl_archive_conversations")
    .select("id,contact_id,type,unread_count,last_message_body,last_message_type,last_message_date", {
      count: "exact",
    })
    .order("last_message_date", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) query = query.ilike("last_message_body", `%${q}%`);

  const { data, count, error } = await query;
  const total = count ?? 0;

  // Fetch contact names in one batch for the visible page
  const contactIds = Array.from(new Set((data ?? []).map((d: any) => d.contact_id).filter(Boolean)));
  let contactsById: Record<string, { name: string; email: string }> = {};
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("ghl_archive_contacts")
      .select("id,contact_name,first_name,last_name,email")
      .in("id", contactIds);
    if (contacts) {
      contactsById = Object.fromEntries(
        contacts.map((c: any) => [
          c.id,
          {
            name: c.contact_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "(unnamed)",
            email: c.email || "",
          },
        ])
      );
    }
  }

  return (
    <div>
      <ArchiveHeader
        title="GHL Archive · Conversations"
        total={total}
        description="Email and SMS thread metadata. Click into a thread (coming soon) to see every message body."
      />
      <SearchBar q={q} placeholder="Search last message body…" />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-4">
          Error: {error.message}
        </div>
      )}

      {!data || data.length === 0 ? (
        <EmptyState>{q ? `No conversations match "${q}".` : "No conversations yet."}</EmptyState>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Contact</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Type</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Last message</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">When</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Unread</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c: any) => {
                const contact = c.contact_id ? contactsById[c.contact_id] : null;
                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4">
                      <p className="font-medium">{contact?.name || "(no contact)"}</p>
                      <p className="text-xs text-gray-400">{contact?.email || ""}</p>
                    </td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor(c.last_message_type ?? c.type)}`}>
                        {c.last_message_type ?? c.type ?? "—"}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-gray-700 max-w-md">{truncate(stripHtml(c.last_message_body), 120)}</td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{fmtDateTime(c.last_message_date)}</td>
                    <td className="py-2 px-4 text-center">
                      {c.unread_count > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          {c.unread_count}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} baseHref="/archive/conversations" q={q} />
    </div>
  );
}
