import { supabase } from "../../../utils/supabase";
import { ArchiveHeader, SearchBar, Pager, EmptyState, fmtDateTime } from "../_lib";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const statusColor = (s: string | null) => {
  if (!s) return "bg-gray-100 text-gray-600";
  const k = s.toLowerCase();
  if (k.includes("confirm") || k.includes("show")) return "bg-green-100 text-green-700";
  if (k.includes("cancel")) return "bg-red-100 text-red-700";
  if (k.includes("no")) return "bg-orange-100 text-orange-700"; // no-show
  if (k.includes("schedul")) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
};

export default async function ArchiveAppointments({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1"));

  // Calendars overview block
  const { data: calendars } = await supabase
    .from("ghl_archive_calendars")
    .select("id,name,description,is_active");

  // Appointments query
  let query = supabase
    .from("ghl_archive_appointments")
    .select(
      "id,calendar_id,contact_id,title,appointment_status,start_time,end_time,date_added,notes",
      { count: "exact" },
    )
    .order("start_time", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) query = query.ilike("title", `%${q}%`);

  const { data, count, error } = await query;
  const total = count ?? 0;

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

  const calendarsById: Record<string, string> = Object.fromEntries(
    (calendars ?? []).map((c: any) => [c.id, c.name || "(unnamed)"])
  );

  return (
    <div>
      <ArchiveHeader
        title="GHL Archive · Appointments"
        total={total}
        description="Every consultation booked through your GHL calendars (past + future)."
      />

      {calendars && calendars.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Calendars</p>
          <div className="flex flex-wrap gap-2">
            {calendars.map((c: any) => (
              <span
                key={c.id}
                className={`px-3 py-1 rounded-lg text-sm ${
                  c.is_active ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-500"
                }`}
              >
                {c.name || "(unnamed)"} {c.is_active ? "" : "· inactive"}
              </span>
            ))}
          </div>
        </div>
      )}

      <SearchBar q={q} placeholder="Search appointment title…" />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-4">
          Error: {error.message}
        </div>
      )}

      {!data || data.length === 0 ? (
        <EmptyState>{q ? `No appointments match "${q}".` : "No appointments in the archive."}</EmptyState>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">When</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Title</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Contact</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Calendar</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a: any) => {
                const contact = a.contact_id ? contactsById[a.contact_id] : null;
                return (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4 text-xs text-gray-700">{fmtDateTime(a.start_time)}</td>
                    <td className="py-2 px-4 font-medium">{a.title || "—"}</td>
                    <td className="py-2 px-4 text-gray-700">
                      {contact?.name || "—"}
                      {contact?.email && <p className="text-xs text-gray-400">{contact.email}</p>}
                    </td>
                    <td className="py-2 px-4 text-gray-600 text-xs">{calendarsById[a.calendar_id] || "—"}</td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(a.appointment_status)}`}>
                        {a.appointment_status || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} baseHref="/archive/calendars" q={q} />
    </div>
  );
}
