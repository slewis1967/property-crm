import Link from "next/link";
import { supabase } from "../../utils/supabase";

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

const statusBadge = (s: string, isPast: boolean) => {
  if (s === "cancelled") return "bg-red-100 text-red-700";
  if (s === "rescheduled") return "bg-amber-100 text-amber-700";
  if (isPast) return "bg-gray-100 text-gray-600";
  return "bg-green-100 text-green-700";
};

export default async function AppointmentsPage() {
  const nowIso = new Date().toISOString();

  // Upcoming bookings (start_time >= now, status != cancelled), soonest first
  const { data: upcoming } = await supabase
    .from("appointments")
    .select("*")
    .gte("start_time", nowIso)
    .neq("status", "cancelled")
    .order("start_time", { ascending: true })
    .limit(100);

  // Recent past bookings (last 30 days), most recent first
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: past } = await supabase
    .from("appointments")
    .select("*")
    .gte("start_time", thirtyDaysAgo)
    .lt("start_time", nowIso)
    .order("start_time", { ascending: false })
    .limit(50);

  // Cancelled in last 30 days, most recent first
  const { data: cancelled } = await supabase
    .from("appointments")
    .select("*")
    .eq("status", "cancelled")
    .gte("created_at", thirtyDaysAgo)
    .order("start_time", { ascending: false })
    .limit(50);

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Appointments</h1>
      <p className="text-sm text-gray-500 mb-6">
        Live Cal.com bookings. Updated automatically via the booking webhook.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Upcoming" value={upcoming?.length ?? 0} accent="bg-green-50 text-green-700 border-green-200" />
        <StatCard label="Past (30d)" value={past?.length ?? 0} accent="bg-gray-50 text-gray-700 border-gray-200" />
        <StatCard label="Cancelled (30d)" value={cancelled?.length ?? 0} accent="bg-red-50 text-red-700 border-red-200" />
      </div>

      <Section title={`Upcoming (${upcoming?.length ?? 0})`} rows={upcoming as AppointmentRow[] | null} emptyText="No upcoming bookings." />

      <Section title={`Past 30 days (${past?.length ?? 0})`} rows={past as AppointmentRow[] | null} emptyText="No bookings in the last 30 days." pastView />

      {cancelled && cancelled.length > 0 && (
        <Section title={`Cancelled (${cancelled.length})`} rows={cancelled as AppointmentRow[] | null} emptyText="" pastView />
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

function Section({ title, rows, emptyText, pastView = false }: { title: string; rows: AppointmentRow[] | null; emptyText: string; pastView?: boolean }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">{title}</h2>
      {!rows || rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-4">{emptyText}</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {rows.map((a) => {
            const start = new Date(a.start_time);
            const isPast = start.getTime() < Date.now();
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
                    {start.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </p>
                  {a.location && (a.location.startsWith("http") ? (
                    <a href={a.location} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                      Join meeting →
                    </a>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">{a.location}</p>
                  ))}
                  {a.cancel_reason && <p className="text-xs text-red-600 italic mt-1">Cancelled: {a.cancel_reason}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
