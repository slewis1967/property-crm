import { supabase } from "../../../utils/supabase";
import { ArchiveHeader, SearchBar, Pager, EmptyState, fmtDateTime, truncate, stripHtml, splitGhlNoteBundle } from "../_lib";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ArchiveNotes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1"));

  let query = supabase
    .from("ghl_archive_notes")
    .select("id,contact_id,body,user_id,pinned,date_added", { count: "exact" })
    .order("date_added", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) query = query.ilike("body", `%${q}%`);

  const { data, count, error } = await query;
  const total = count ?? 0;

  // Resolve contact names in one batch
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
        title="GHL Archive · Notes"
        total={total}
        description="Every note ever logged against a contact in GHL. Search the body to find by content."
      />
      <SearchBar q={q} placeholder="Search note body…" />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-4">
          Error: {error.message}
        </div>
      )}

      {!data || data.length === 0 ? (
        <EmptyState>{q ? `No notes match "${q}".` : "No notes yet."}</EmptyState>
      ) : (
        <div className="space-y-3">
          {data.map((n: any) => {
            const contact = n.contact_id ? contactsById[n.contact_id] : null;
            const entries = splitGhlNoteBundle(stripHtml(n.body));
            return (
              <div
                key={n.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
              >
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                  <p className="font-medium text-sm">{contact?.name || "(no contact)"}</p>
                  {contact?.email && <p className="text-xs text-gray-400">{contact.email}</p>}
                  {n.pinned && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
                      📌 pinned
                    </span>
                  )}
                  <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                    Last edit: {fmtDateTime(n.date_added)}
                  </span>
                  {entries.length > 1 && (
                    <span className="text-xs text-gray-400">· {entries.length} entries</span>
                  )}
                </div>
                <div className="space-y-2">
                  {entries.map((entry, i) => (
                    <div
                      key={i}
                      className="bg-gray-50 rounded-md border border-gray-100 p-3"
                    >
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {entry.body || "(empty entry)"}
                      </p>
                      {(entry.date || entry.author) && (
                        <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-gray-200 text-[11px] text-gray-500">
                          {entry.date ? <span>{entry.date}</span> : <span></span>}
                          {entry.author && <span>by {entry.author}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} baseHref="/archive/notes" q={q} />
    </div>
  );
}
