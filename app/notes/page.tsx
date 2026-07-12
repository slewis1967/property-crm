import Link from "next/link";
import { supabase } from "../../utils/supabase";
import { PageHeader, SearchBar, Pager, EmptyState, fmtDateTime, stripHtml, splitGhlNoteBundle } from "../../utils/archive-helpers";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type NoteRow = {
  id: string;
  contact_id: string | null;
  body: string | null;
  user_id: string | null;
  pinned: boolean | null;
  date_added: string | null;
};

type ArchiveContactRow = {
  id: string;
  contact_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export default async function NotesPage({
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

  const contactIds = Array.from(new Set((data ?? []).map((d: { contact_id: string | null }) => d.contact_id).filter(Boolean)));
  let contactsById: Record<string, { name: string; email: string }> = {};
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("ghl_archive_contacts")
      .select("id,contact_name,first_name,last_name,email")
      .in("id", contactIds);
    if (contacts) {
      contactsById = Object.fromEntries(
        contacts.map((c: ArchiveContactRow) => [
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
      <PageHeader
        title="Notes (archive)"
        total={total}
        description="Read-only archive of notes from GHL. New notes go via Quick Log on the contact detail page."
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
          {data.map((n: NoteRow) => {
            const contact = n.contact_id ? contactsById[n.contact_id] : null;
            const entries = splitGhlNoteBundle(stripHtml(n.body));
            return (
              <div
                key={n.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
              >
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                  {n.contact_id && contact ? (
                    <Link href={`/contacts/${n.contact_id}`} className="font-medium text-sm text-blue-600 hover:underline">
                      {contact.name}
                    </Link>
                  ) : (
                    <p className="font-medium text-sm">(no contact)</p>
                  )}
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

      <Pager page={page} pageSize={PAGE_SIZE} total={total} baseHref="/notes" q={q} />
    </div>
  );
}
