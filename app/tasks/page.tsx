import { supabase } from "../../utils/supabase";
import Link from "next/link";
import { PageHeader, SearchBar, Pager, EmptyState, fmtDateTime, truncate, stripHtml } from "../../utils/archive-helpers";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1"));

  let query = supabase
    .from("ghl_archive_tasks")
    .select("id,contact_id,title,body,due_date,completed,assigned_to,date_added", { count: "exact" })
    .order("due_date", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
  if (status === "completed") query = query.eq("completed", true);
  if (status === "open") query = query.eq("completed", false);

  const { data, count, error } = await query;
  const total = count ?? 0;

  const contactIds = Array.from(new Set((data ?? []).map((d: any) => d.contact_id).filter(Boolean)));
  let contactsById: Record<string, { name: string }> = {};
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("ghl_archive_contacts")
      .select("id,contact_name,first_name,last_name")
      .in("id", contactIds);
    if (contacts) {
      contactsById = Object.fromEntries(
        contacts.map((c: any) => [
          c.id,
          { name: c.contact_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "(unnamed)" },
        ])
      );
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        total={total}
        description="Tasks logged against contacts (sourced from GHL archive)."
      />

      <div className="flex gap-2 mb-4">
        {["", "open", "completed"].map((s) => {
          const href = s ? `?status=${s}` : "?";
          const active = status === s;
          return (
            <a
              key={s || "all"}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
            </a>
          );
        })}
      </div>

      <SearchBar q={q} placeholder="Search title or body…" />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-4">
          Error: {error.message}
        </div>
      )}

      {!data || data.length === 0 ? (
        <EmptyState>
          {q || status ? "No tasks match those filters." : "No tasks yet."}
        </EmptyState>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Title</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Contact</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Due</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Status</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t: any) => {
                const contact = t.contact_id ? contactsById[t.contact_id] : null;
                return (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4">
                      <p className="font-medium">{t.title || "(untitled)"}</p>
                      {t.body && <p className="text-xs text-gray-500 mt-0.5">{truncate(stripHtml(t.body), 100)}</p>}
                    </td>
                    <td className="py-2 px-4">
                      {t.contact_id && contact ? (
                        <Link href={`/contacts/${t.contact_id}`} className="text-blue-600 hover:underline">{contact.name}</Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{fmtDateTime(t.due_date)}</td>
                    <td className="py-2 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.completed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {t.completed ? "✓ done" : "open"}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{fmtDateTime(t.date_added)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} baseHref="/tasks" q={q} />
    </div>
  );
}
