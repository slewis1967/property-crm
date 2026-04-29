import Link from "next/link";
import { supabase } from "../../../utils/supabase";
import { ArchiveHeader, SearchBar, Pager, EmptyState, fmtDate, truncate } from "../_lib";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ArchiveContacts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1"));

  let query = supabase
    .from("ghl_archive_contacts")
    .select("id,contact_name,first_name,last_name,email,phone,type,source,state,country,date_added,tags", {
      count: "exact",
    })
    .order("date_added", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) {
    // Search across name + email + phone
    query = query.or(
      `contact_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`
    );
  }

  const { data, count, error } = await query;
  const total = count ?? 0;

  return (
    <div>
      <ArchiveHeader
        title="GHL Archive · Contacts"
        total={total}
        description="Every contact captured before GHL decommissioning. Search by name, email or phone."
      />
      <SearchBar q={q} placeholder="Search name, email or phone…" />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-4">
          Error: {error.message}
        </div>
      )}

      {!data || data.length === 0 ? (
        <EmptyState>
          {q ? `No contacts match "${q}".` : "No contacts in the archive yet — run ghl_to_supabase.py."}
        </EmptyState>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Name</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Email</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Phone</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">State</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Source</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Tags</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c: any) => {
                const name = c.contact_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "—";
                const tags = Array.isArray(c.tags) ? c.tags : [];
                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4 font-medium">
                      <Link href={`/archive/contacts/${c.id}`} className="text-blue-600 hover:underline">{name}</Link>
                    </td>
                    <td className="py-2 px-4 text-gray-700">{c.email || "—"}</td>
                    <td className="py-2 px-4 text-gray-500">{c.phone || "—"}</td>
                    <td className="py-2 px-4 text-gray-600">{c.state || "—"}</td>
                    <td className="py-2 px-4 text-gray-500">{truncate(c.source, 24)}</td>
                    <td className="py-2 px-4">
                      <div className="flex flex-wrap gap-1">
                        {tags.slice(0, 3).map((t: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                            {t}
                          </span>
                        ))}
                        {tags.length > 3 && (
                          <span className="text-xs text-gray-400">+{tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{fmtDate(c.date_added)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} baseHref="/archive/contacts" q={q} />
    </div>
  );
}
