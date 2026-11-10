import Link from "next/link";
import { supabase } from "../../utils/supabase";
import { roomForContact } from "../../utils/livekit-rooms";
import { formatAgendaDateTime, formatDateTime } from "../../utils/datetime";
import AIPreMeetingBrief from "../components/AIPreMeetingBrief";

export const dynamic = "force-dynamic";

type AppointmentRow = {
  id: string;
  cal_uid: string | null;
  contact_id: string | null;
  contact_email: string;
  contact_name: string | null;
  host_email: string;
  host_name: string | null;
  event_title: string | null;
  event_slug: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  status: string;
  cancel_reason: string | null;
  created_at: string;
};

type ArchiveAppt = {
  id: string;
  calendar_id: string | null;
  contact_id: string | null;
  title: string | null;
  appointment_status: string | null;
  start_time: string | null;
  end_time: string | null;
  date_added: string | null;
  notes: string | null;
};

type ArchiveCalendar = {
  id: string;
  name: string | null;
  description: string | null;
  is_active: boolean | null;
};

const statusBadge = (s: string, isPast: boolean) => {
  if (s === "cancelled") return "bg-red-100 text-red-700";
  if (s === "rescheduled") return "bg-amber-100 text-amber-700";
  if (isPast) return "bg-gray-100 text-gray-600";
  return "bg-green-100 text-green-700";
};

const archiveStatusBadge = (s: string | null) => {
  if (!s) return "bg-gray-100 text-gray-600";
  const k = s.toLowerCase();
  if (k.includes("confirm") || k.includes("show")) return "bg-green-100 text-green-700";
  if (k.includes("cancel")) return "bg-red-100 text-red-700";
  if (k.includes("no")) return "bg-orange-100 text-orange-700";
  if (k.includes("schedul")) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
};

const fmtDateTime = (s: string | null | undefined) => formatDateTime(s);

export default async function AppointmentsPage() {
  // Stamp "now" once and thread it down, rather than each row calling Date.now()
  // mid-render — that made a row's past/upcoming styling depend on when React
  // happened to render it.
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const thirtyDaysAgo = new Date(nowMs - 30 * 86400_000).toISOString();

  const [
    { data: upcoming },
    { data: past },
    { data: cancelled },
    { data: archiveCalendars },
    { data: archiveAppts },
  ] = await Promise.all([
    // Upcoming bookings (start_time >= now, status != cancelled), soonest first
    supabase
      .from("appointments")
      .select("*")
      .gte("start_time", nowIso)
      .neq("status", "cancelled")
      .order("start_time", { ascending: true })
      .limit(100),
    // Recent past bookings (last 30 days), most recent first
    supabase
      .from("appointments")
      .select("*")
      .gte("start_time", thirtyDaysAgo)
      .lt("start_time", nowIso)
      .order("start_time", { ascending: false })
      .limit(50),
    // Cancelled in last 30 days, most recent first
    supabase
      .from("appointments")
      .select("*")
      .eq("status", "cancelled")
      .gte("created_at", thirtyDaysAgo)
      .order("start_time", { ascending: false })
      .limit(50),
    // GHL archive calendars overview
    supabase
      .from("ghl_archive_calendars")
      .select("id,name,description,is_active"),
    // GHL archive appointments — recent 100
    supabase
      .from("ghl_archive_appointments")
      .select("id,calendar_id,contact_id,title,appointment_status,start_time,end_time,date_added,notes")
      .order("start_time", { ascending: false, nullsFirst: false })
      .limit(100),
  ]);

  // Resolve archive contact names in one batch
  const archContactIds = Array.from(
    new Set((archiveAppts ?? []).map((a) => a.contact_id).filter(Boolean))
  );
  let archContactsById: Record<string, { name: string; email: string }> = {};
  if (archContactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("ghl_archive_contacts")
      .select("id,contact_name,first_name,last_name,email")
      .in("id", archContactIds);
    if (contacts) {
      archContactsById = Object.fromEntries(
        contacts.map((c) => [
          c.id,
          {
            name:
              c.contact_name ||
              `${c.first_name || ""} ${c.last_name || ""}`.trim() ||
              "(unnamed)",
            email: c.email || "",
          },
        ])
      );
    }
  }

  const archCalsById: Record<string, string> = Object.fromEntries(
    (archiveCalendars ?? []).map((c) => [c.id, c.name || "(unnamed)"])
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Appointments</h1>
      <p className="text-sm text-gray-500 mb-6">
        Meetings scheduled from the CRM and legacy Cal.com bookings, plus the GHL archive of historical calendar bookings.
        Bookings made outside the CRM are not synced back here.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Upcoming" value={upcoming?.length ?? 0} accent="bg-green-50 text-green-700 border-green-200" />
        <StatCard label="Past (30d)" value={past?.length ?? 0} accent="bg-gray-50 text-gray-700 border-gray-200" />
        <StatCard label="Cancelled (30d)" value={cancelled?.length ?? 0} accent="bg-red-50 text-red-700 border-red-200" />
        <StatCard label="Archive (recent 100)" value={archiveAppts?.length ?? 0} accent="bg-purple-50 text-purple-700 border-purple-200" />
      </div>

      <Section title={`Upcoming (${upcoming?.length ?? 0})`} rows={upcoming as AppointmentRow[] | null} emptyText="No upcoming bookings." nowMs={nowMs} showBrief />

      <Section title={`Past 30 days (${past?.length ?? 0})`} rows={past as AppointmentRow[] | null} emptyText="No bookings in the last 30 days." nowMs={nowMs} pastView />

      {cancelled && cancelled.length > 0 && (
        <Section title={`Cancelled (${cancelled.length})`} rows={cancelled as AppointmentRow[] | null} emptyText="" nowMs={nowMs} pastView />
      )}

      {/* GHL archive calendars + appointments — historical record */}
      {archiveCalendars && archiveCalendars.length > 0 && (
        <section className="mt-10 mb-6">
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">GHL Archive · Calendars</h2>
            <span className="text-xs text-gray-400">{archiveCalendars.length}</span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex flex-wrap gap-2">
              {archiveCalendars.map((c) => (
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
        </section>
      )}

      {archiveAppts && archiveAppts.length > 0 && (
        <section className="mb-8">
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">GHL Archive · Appointments</h2>
            <span className="text-xs text-gray-400">recent {archiveAppts.length}</span>
          </div>
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
                {(archiveAppts as ArchiveAppt[]).map((a) => {
                  const contact = a.contact_id ? archContactsById[a.contact_id] : null;
                  return (
                    <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-4 text-xs text-gray-700">{fmtDateTime(a.start_time)}</td>
                      <td className="py-2 px-4 font-medium">{a.title || "—"}</td>
                      <td className="py-2 px-4 text-gray-700">
                        {a.contact_id && contact ? (
                          <Link href={`/contacts/${a.contact_id}`} className="text-blue-600 hover:underline">{contact.name}</Link>
                        ) : (
                          "—"
                        )}
                        {contact?.email && <p className="text-xs text-gray-400">{contact.email}</p>}
                      </td>
                      <td className="py-2 px-4 text-gray-600 text-xs">{a.calendar_id ? archCalsById[a.calendar_id] || "—" : "—"}</td>
                      <td className="py-2 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${archiveStatusBadge(a.appointment_status)}`}>
                          {a.appointment_status || "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${accent}`}>
      <p className="text-xs uppercase tracking-wide font-medium opacity-70">{label}</p>
      <p className="text-2xl font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function Section({ title, rows, emptyText, nowMs, pastView = false, showBrief = false }: { title: string; rows: AppointmentRow[] | null; emptyText: string; nowMs: number; pastView?: boolean; showBrief?: boolean }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">{title}</h2>
      {!rows || rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-4">{emptyText}</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {rows.map((a) => {
            const start = new Date(a.start_time);
            const isPast = start.getTime() < nowMs;
            return (
              <div key={a.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{a.event_title || "(untitled event)"}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge(a.status, pastView ? false : isPast)}`}>
                      {a.status}
                    </span>
                  </div>
                  <p className="text-gray-600 mt-0.5">
                    {a.contact_id ? (
                      <Link href={`/contacts/${a.contact_id}`} className="text-blue-600 hover:underline">
                        {a.contact_name || a.contact_email}
                      </Link>
                    ) : (
                      <span>{a.contact_name || a.contact_email}</span>
                    )}
                    {" · with "}
                    <span className="text-gray-700">{a.host_name || a.host_email}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatAgendaDateTime(start)}
                  </p>
                  {a.location && (a.location.startsWith("http") ? (
                    // Staff join at the authed room page. `location` holds the
                    // GUEST link, which names the client — a broker opening it
                    // joins under the client's name (and, before guest
                    // identities were unique, evicted them from the call).
                    <a
                      href={a.contact_id ? `/video/${roomForContact(a.contact_id)}` : a.location}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                    >
                      Join meeting →
                    </a>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">{a.location}</p>
                  ))}
                  {a.cancel_reason && <p className="text-xs text-red-600 italic mt-1">Cancelled: {a.cancel_reason}</p>}
                  {showBrief && a.status !== "cancelled" && (
                    <div className="mt-2">
                      <AIPreMeetingBrief appointmentId={a.id} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
