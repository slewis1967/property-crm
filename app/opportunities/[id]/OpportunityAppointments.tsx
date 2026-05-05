"use client";

/**
 * OpportunityAppointments — small read-only list of Cal.com bookings
 * matching this lead's email. Fetched client-side from Supabase via the
 * already-shipped appointments view. Booking new ones is handled by the
 * "📅 Book appointment" button in the top toolbar (opens cal.com).
 */
import { useEffect, useState } from "react";
import { supabase } from "../../../utils/supabase";

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

export default function OpportunityAppointments({ leadEmail }: { leadEmail: string | null }) {
  const [rows, setRows] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadEmail) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id,cal_uid,event_title,start_time,end_time,location,status,host_name")
        .eq("contact_email", leadEmail)
        .order("start_time", { ascending: false })
        .limit(8);
      if (!cancelled) {
        setRows(data ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leadEmail]);

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
