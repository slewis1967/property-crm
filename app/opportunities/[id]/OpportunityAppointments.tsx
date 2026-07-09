"use client";

/**
 * OpportunityAppointments — small read-only list of bookings matching this
 * lead's email: meetings scheduled from the CRM, plus any legacy rows from the
 * old Cal.com feed. Goes through /api/opportunities/{id}/appointments
 * (server-side Supabase query) since the supabase util is service-role only
 * and can't be imported into a "use client" bundle.
 */
import { useEffect, useState } from "react";

type Appointment = {
  id: string;
  cal_uid: string | null;
  event_title: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  status: string;
  host_name: string | null;
};

const statusBadge = (s: string, isPast: boolean) => {
  if (s === "cancelled")   return "bg-red-100 text-red-700";
  if (s === "rescheduled") return "bg-amber-100 text-amber-700";
  if (isPast)              return "bg-gray-100 text-gray-600";
  return "bg-green-100 text-green-700";
};

const fmtDt = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function OpportunityAppointments({
  opportunityId,
  leadEmail,
}: {
  opportunityId: string;
  leadEmail: string | null;
}) {
  const [rows, setRows] = useState<Appointment[]>([]);
  // With no lead email there is nothing to fetch, so start settled rather than
  // starting true and immediately clearing it from inside the effect. The
  // component renders null in that case anyway.
  const [loading, setLoading] = useState(!!leadEmail);

  useEffect(() => {
    if (!leadEmail) return;
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/opportunities/${opportunityId}/appointments?email=${encodeURIComponent(leadEmail)}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setRows(data.appointments ?? []);
      } catch {
        // Surface nothing — empty list is a fine fallback for this card.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [opportunityId, leadEmail]);

  if (!leadEmail) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Appointments</h2>
        {!loading && rows.length > 0 && (
          <span className="text-[11px] text-gray-400">{rows.length} matched</span>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400">
          No bookings yet. Use 📅 Book appointment in the top bar to schedule one with this lead.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((a) => {
            const isPast = a.start_time && new Date(a.start_time) < new Date();
            return (
              <div key={a.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {a.event_title || "Booking"}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {fmtDt(a.start_time)}
                    {a.host_name && ` · with ${a.host_name}`}
                    {a.location && ` · ${a.location}`}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(a.status, !!isPast)}`}>
                  {a.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
