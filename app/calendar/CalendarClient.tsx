"use client";

/**
 * Month / week calendar grid over /api/appointments (GET ?from&to). All times
 * render in the business timezone (see utils/datetime.ts), NOT the browser's —
 * /appointments renders the same rows on the server, and the two must agree.
 * The CRM `appointments` table is the source of truth — there is no external
 * calendar to sync with.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { roomForContact } from "../../utils/livekit-rooms";
import { businessDayKey, formatLongDateTime, formatTime } from "../../utils/datetime";
import AppointmentForm, { type Host } from "./AppointmentForm";

type Appt = {
  id: string;
  title: string | null;
  event_title: string | null;
  start_time: string;
  end_time: string | null;
  status: string | null;
  appointment_status: string | null;
  location: string | null;
  notes: string | null;
  host_name: string | null;
  host_email: string | null;
  contact_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
};

type View = "month" | "week";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// --- Local-date helpers (no external dep; all in the browser's tz) ---
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Monday on/before the given date (AU week starts Monday). */
function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  return addDays(x, -dow);
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** Key for a grid cell. `d` is already a calendar day, so its own Y/M/D are it. */
function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function apptTitle(a: Appt): string {
  return a.event_title || a.title || "(untitled)";
}
function apptStatus(a: Appt): string {
  return (a.status || a.appointment_status || "scheduled").toLowerCase();
}
function isVideo(a: Appt): boolean {
  return !!a.location && a.location.startsWith("http");
}

function chipClasses(status: string, isPast: boolean): string {
  if (status === "cancelled") return "bg-red-100 text-red-700 line-through";
  if (status === "rescheduled") return "bg-amber-100 text-amber-800";
  if (isPast) return "bg-gray-100 text-gray-500";
  return "bg-teal-100 text-teal-800";
}

export default function CalendarClient() {
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Appt | null>(null);
  const [hosts, setHosts] = useState<Host[]>([]);
  // The form: null = closed; {appt} = edit it; {date} = new entry on that day.
  const [form, setForm] = useState<{ appt?: Appt; date?: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  // Bumped after any add/change/cancel/delete so the range effect refetches.
  const [reloadKey, setReloadKey] = useState(0);

  const now = useMemo(() => new Date(), []);

  // Visible range: month view shows a 6-week grid; week view shows 7 days.
  const range = useMemo(() => {
    if (view === "week") {
      const from = mondayOf(anchor);
      return { from, to: addDays(from, 7), gridStart: from, gridDays: 7 };
    }
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = mondayOf(firstOfMonth);
    return { from: gridStart, to: addDays(gridStart, 42), gridStart, gridDays: 42 };
  }, [view, anchor]);

  // Fetch whenever the visible range changes. State updates all happen after the
  // first await (or in finally), never synchronously in the effect body, so the
  // loading flag is flipped ON by the nav event handlers instead (both allowed
  // by react-hooks/set-state-in-effect). `cancelled` drops a stale response when
  // the user navigates again before the fetch resolves.
  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/appointments?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
        setAppts((data.appointments as Appt[]) ?? []);
        if (Array.isArray(data.hosts)) setHosts(data.hosts as Host[]);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setAppts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromISO, toISO, reloadKey]);

  /** After any write: close dialogs, say what happened, refetch. */
  const afterWrite = (okText: string, warning: string | null) => {
    setForm(null);
    setSelected(null);
    setNotice(warning ? { kind: "warn", text: warning } : { kind: "ok", text: okText });
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  // Bucket appointments by business day for O(1) cell lookup — matching the
  // zone the times render in, so a meeting can't sit in the wrong cell.
  const byDay = useMemo(() => {
    const map = new Map<string, Appt[]>();
    for (const a of appts) {
      const key = businessDayKey(a.start_time);
      if (!key) continue;
      const arr = map.get(key);
      if (arr) arr.push(a);
      else map.set(key, [a]);
    }
    for (const arr of map.values()) {
      arr.sort((x, y) => +new Date(x.start_time) - +new Date(y.start_time));
    }
    return map;
  }, [appts]);

  // Nav handlers flip the loading flag (event-handler setState is fine) and move
  // the anchor; the range-keyed effect then refetches.
  const goPrev = () => {
    setLoading(true);
    setAnchor((a) => (view === "week" ? addDays(a, -7) : new Date(a.getFullYear(), a.getMonth() - 1, 1)));
  };
  const goNext = () => {
    setLoading(true);
    setAnchor((a) => (view === "week" ? addDays(a, 7) : new Date(a.getFullYear(), a.getMonth() + 1, 1)));
  };
  const goToday = () => {
    setLoading(true);
    setAnchor(startOfDay(new Date()));
  };
  const changeView = (v: View) => {
    setLoading(true);
    setView(v);
  };

  const heading = useMemo(() => {
    if (view === "week") {
      const from = mondayOf(anchor);
      const to = addDays(from, 6);
      const sameMonth = from.getMonth() === to.getMonth();
      const f = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: sameMonth ? undefined : "short" });
      return `${f.format(from)} – ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(to)}`;
    }
    return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(anchor);
  }, [view, anchor]);

  const days = useMemo(
    () => Array.from({ length: range.gridDays }, (_, i) => addDays(range.gridStart, i)),
    [range.gridStart, range.gridDays],
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} aria-label="Previous" className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">‹</button>
          <button onClick={goToday} className="px-3 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700">Today</button>
          <button onClick={goNext} aria-label="Next" className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">›</button>
          <h2 className="ml-2 text-lg font-semibold text-gray-900">{heading}</h2>
          {loading && <span className="text-xs text-gray-400 ml-2">Loading…</span>}
        </div>
        <div className="flex items-center gap-2">
        <button
          onClick={() => setForm({})}
          className="px-3 h-8 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"
        >
          + New appointment
        </button>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(["month", "week"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => changeView(v)}
              className={`px-3 py-1 rounded-md text-sm font-medium capitalize transition ${
                view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        </div>
      </div>

      {notice && (
        <div className={`rounded-xl px-4 py-3 text-sm mb-4 flex items-start justify-between gap-3 border ${
          notice.kind === "ok" ? "bg-teal-50 border-teal-200 text-teal-800" : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">✕</button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {view === "month" ? (
        <MonthGrid days={days} anchorMonth={anchor.getMonth()} now={now} byDay={byDay} onSelect={setSelected}
          onAddOnDay={(d) => setForm({ date: dayKey(d) })} />
      ) : (
        <WeekAgenda days={days} now={now} byDay={byDay} onSelect={setSelected}
          onAddOnDay={(d) => setForm({ date: dayKey(d) })} />
      )}

      {selected && !form && (
        <ApptDetail
          appt={selected}
          now={now}
          onClose={() => setSelected(null)}
          onEdit={() => setForm({ appt: selected })}
          onRemoved={(text, warning) => afterWrite(text, warning)}
        />
      )}

      {form && (
        <AppointmentForm
          appt={form.appt ? { ...form.appt, event_title: apptTitle(form.appt) } : undefined}
          initialDate={form.date}
          hosts={hosts}
          onClose={() => setForm(null)}
          onSaved={(warning) => afterWrite(form.appt ? "Appointment updated." : "Appointment added to the diary.", warning)}
        />
      )}
    </div>
  );
}

function MonthGrid({
  days, anchorMonth, now, byDay, onSelect, onAddOnDay,
}: {
  days: Date[]; anchorMonth: number; now: Date; byDay: Map<string, Appt[]>; onSelect: (a: Appt) => void;
  onAddOnDay: (d: Date) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-xs font-semibold text-gray-500 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = d.getMonth() === anchorMonth;
          const isToday = sameDay(d, now);
          const dayAppts = byDay.get(dayKey(d)) ?? [];
          return (
            <div
              key={d.toISOString()}
              onClick={() => onAddOnDay(d)}
              title="Click an empty spot to add an appointment on this day"
              className={`group min-h-[104px] border-b border-r border-gray-100 p-1.5 cursor-pointer hover:bg-teal-50/40 ${inMonth ? "bg-white" : "bg-gray-50/60"}`}
            >
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-teal-700 opacity-0 group-hover:opacity-100 pl-0.5">+ Add</span>
                <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? "bg-teal-600 text-white font-semibold" : inMonth ? "text-gray-700" : "text-gray-400"
                }`}>
                  {d.getDate()}
                </span>
              </div>
              <div className="mt-0.5 space-y-1">
                {dayAppts.slice(0, 3).map((a) => {
                  const isPast = +new Date(a.start_time) < +now;
                  return (
                    <button
                      key={a.id}
                      onClick={(e) => { e.stopPropagation(); onSelect(a); }}
                      title={apptTitle(a)}
                      className={`w-full text-left px-1.5 py-0.5 rounded text-[11px] leading-tight truncate ${chipClasses(apptStatus(a), isPast)}`}
                    >
                      <span className="tabular-nums">
                        {formatTime(a.start_time)}
                      </span>{" "}
                      {isVideo(a) ? "📹 " : ""}{apptTitle(a)}
                    </button>
                  );
                })}
                {dayAppts.length > 3 && (
                  <button onClick={(e) => { e.stopPropagation(); onSelect(dayAppts[3]); }} className="text-[11px] text-gray-500 hover:text-gray-700 pl-1.5">
                    +{dayAppts.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekAgenda({
  days, now, byDay, onSelect, onAddOnDay,
}: {
  days: Date[]; now: Date; byDay: Map<string, Appt[]>; onSelect: (a: Appt) => void;
  onAddOnDay: (d: Date) => void;
}) {
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const dayAppts = byDay.get(dayKey(d)) ?? [];
        const isToday = sameDay(d, now);
        return (
          <div key={d.toISOString()} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className={`px-4 py-2 border-b border-gray-100 flex items-center gap-2 ${isToday ? "bg-teal-50" : "bg-gray-50"}`}>
              <span className={`text-sm font-semibold ${isToday ? "text-teal-800" : "text-gray-700"}`}>
                {new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "short" }).format(d)}
              </span>
              {isToday && <span className="text-[10px] font-semibold text-teal-700 bg-teal-100 rounded-full px-2 py-0.5">TODAY</span>}
              <span className="text-xs text-gray-400 ml-auto">{dayAppts.length || "—"}</span>
              <button onClick={() => onAddOnDay(d)} className="text-xs font-medium text-teal-700 hover:text-teal-900 ml-2">+ Add</button>
            </div>
            {dayAppts.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400 italic">No meetings.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {dayAppts.map((a) => {
                  const isPast = +new Date(a.start_time) < +now;
                  return (
                    <button
                      key={a.id}
                      onClick={() => onSelect(a)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-start gap-3"
                    >
                      <span className="text-xs tabular-nums text-gray-500 w-20 shrink-0 pt-0.5">
                        {formatTime(a.start_time)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 text-sm truncate">{isVideo(a) ? "📹 " : ""}{apptTitle(a)}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${chipClasses(apptStatus(a), isPast)}`}>{apptStatus(a)}</span>
                        </span>
                        <span className="text-xs text-gray-500 block truncate">
                          {a.contact_name || a.contact_email || "—"} · with {a.host_name || a.host_email || "—"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ApptDetail({
  appt, now, onClose, onEdit, onRemoved,
}: {
  appt: Appt; now: Date; onClose: () => void; onEdit: () => void;
  onRemoved: (text: string, warning: string | null) => void;
}) {
  // Cancel keeps the entry (struck through, stays on the client's history);
  // delete removes it for good: for mistakes and duplicates.
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const start = new Date(appt.start_time);
  const end = appt.end_time ? new Date(appt.end_time) : null;
  const isPast = +start < +now;
  const when = formatLongDateTime(start);
  const endStr = end ? formatTime(end) : null;
  const video = isVideo(appt);
  const status = apptStatus(appt);
  // Only an upcoming, still-live meeting with a client email gets a cancellation email.
  const canNotify = !!appt.contact_email && status !== "cancelled" && +(end ?? start) > +now;

  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/appointments/${appt.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: confirm, reason: reason || undefined, notify: canNotify && notify }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      onRemoved(confirm === "cancel" ? "Appointment cancelled." : "Appointment deleted.", data.notify_warning ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">{apptTitle(appt)}</h3>
            <p className={`text-xs mt-0.5 px-1.5 py-0.5 rounded inline-block ${chipClasses(apptStatus(appt), isPast)}`}>{apptStatus(appt)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 -mr-1">✕</button>
        </div>
        <div className="px-5 py-4 space-y-2.5 text-sm">
          <p className="text-gray-700">🕑 {when}{endStr ? ` – ${endStr}` : ""}</p>
          <p className="text-gray-700">
            👤 {appt.contact_id ? (
              <Link href={`/contacts/${appt.contact_id}`} className="text-teal-700 hover:underline">
                {appt.contact_name || appt.contact_email}
              </Link>
            ) : (appt.contact_name || appt.contact_email || "—")}
          </p>
          <p className="text-gray-700">🎩 with {appt.host_name || appt.host_email || "—"}</p>
          {appt.notes && <p className="text-gray-600 whitespace-pre-line border-t border-gray-100 pt-2">{appt.notes}</p>}
          {video && (
            <a
              // Staff join through the authed room page, not the guest link in
              // `location`. That link carries the CLIENT's name, so a broker
              // opening it joined the call labelled as the client (and, before
              // guest identities were made unique, evicted them from it).
              href={
                appt.contact_id
                  ? `/video/${roomForContact(appt.contact_id)}`
                  : appt.location!
              }
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              📹 Join video meeting
            </a>
          )}
          {!video && appt.location && <p className="text-gray-700">📍 {appt.location}</p>}
        </div>

        {confirm ? (
          <div className="px-5 py-4 border-t border-gray-100 space-y-3 text-sm bg-gray-50 rounded-b-2xl">
            <p className="font-medium text-gray-900">
              {confirm === "cancel"
                ? "Cancel this appointment? It stays in the diary, marked cancelled."
                : "Delete this appointment for good? It can't be brought back."}
            </p>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {canNotify && (
              <label className="flex items-start gap-2 text-gray-700">
                <input type="checkbox" className="mt-0.5" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                <span>Email {appt.contact_name || appt.contact_email} a cancellation (removes it from their calendar)</span>
              </label>
            )}
            {err && <p className="text-red-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setConfirm(null); setErr(null); }} className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-white">Back</button>
              <button
                onClick={remove}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Working…" : confirm === "cancel" ? "Cancel appointment" : "Delete appointment"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-gray-100">
            <button onClick={() => setConfirm("delete")} className="px-3 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50 mr-auto">Delete</button>
            {status !== "cancelled" && (
              <button onClick={() => setConfirm("cancel")} className="px-3 py-1.5 rounded-lg text-sm text-gray-700 border border-gray-200 hover:bg-gray-50">Cancel appointment</button>
            )}
            <button onClick={onEdit} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700">Change</button>
          </div>
        )}
      </div>
    </div>
  );
}
