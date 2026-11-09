"use client";

/**
 * Add or change a diary entry from /calendar.
 *
 * Create → POST /api/appointments (the same route the opportunity scheduler
 * uses). A client is optional: with one, the meeting gets a LiveKit video link
 * and the client is emailed an invite; without one it's a plain diary entry
 * (internal meeting, site visit, block-out).
 * Edit → PATCH /api/appointments/<id>. If the client was invited and the time or
 * details change, they're emailed an updated calendar invite (untick to skip).
 *
 * All times are entered and shown in Brisbane time (utils/datetime.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { businessDateTimeParts, businessWallClockToISO } from "../../utils/datetime";

export type Host = { email: string; label: string; displayName: string };

export type EditableAppt = {
  id: string;
  event_title: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  host_email: string | null;
  contact_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
};

type ContactOpt = { id: string; name: string | null; full_name: string | null; email: string | null; phone: string | null };

const DURATIONS = [15, 30, 45, 60, 90, 120];

function contactLabel(c: ContactOpt): string {
  return c.full_name || c.name || c.email || "(no name)";
}

export default function AppointmentForm({
  appt,
  initialDate,
  hosts,
  onClose,
  onSaved,
}: {
  /** Present = edit this appointment; absent = create a new one. */
  appt?: EditableAppt;
  /** YYYY-MM-DD to prefill when creating from a day cell. */
  initialDate?: string;
  hosts: Host[];
  onClose: () => void;
  /** Called after a successful save with any warning to show (e.g. invite failed). */
  onSaved: (warning: string | null) => void;
}) {
  const editing = !!appt;
  const isVideo = !!appt?.location && /\/join\//.test(appt.location);

  const initial = useMemo(() => {
    if (appt) {
      const s = businessDateTimeParts(appt.start_time);
      const e = businessDateTimeParts(appt.end_time ?? appt.start_time);
      return { date: s?.date ?? "", start: s?.time ?? "09:00", end: e?.time ?? "10:00" };
    }
    return { date: initialDate ?? businessDateTimeParts(new Date())!.date, start: "09:00", end: "10:00" };
  }, [appt, initialDate]);

  const [title, setTitle] = useState(appt?.event_title ?? "");
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [host, setHost] = useState(appt?.host_email ?? "");
  const [location, setLocation] = useState(isVideo ? "" : appt?.location ?? "");
  const [notes, setNotes] = useState(appt?.notes ?? "");
  const [notify, setNotify] = useState(true);

  // Client picker — create only (an existing meeting keeps its client).
  const [contacts, setContacts] = useState<ContactOpt[] | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [contact, setContact] = useState<ContactOpt | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/contacts/search", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setContacts((data.contacts as ContactOpt[]) ?? []);
      } catch {
        if (!cancelled) setContacts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [editing]);

  const matches = useMemo(() => {
    if (!contacts) return [];
    const q = contactQuery.trim().toLowerCase();
    const list = q
      ? contacts.filter((c) =>
          [c.full_name, c.name, c.email, c.phone].some((v) => (v ?? "").toLowerCase().includes(q)))
      : contacts;
    return list.slice(0, 8);
  }, [contacts, contactQuery]);

  const setDuration = (mins: number) => {
    const iso = businessWallClockToISO(date || initial.date, start);
    if (!iso) return;
    const e = businessDateTimeParts(Date.parse(iso) + mins * 60_000);
    if (e) setEnd(e.time);
  };

  const hasClientEmail = editing ? !!appt?.contact_email : !!contact?.email;

  async function save() {
    setError(null);
    if (!title.trim()) return setError("Give the appointment a title.");
    const startISO = businessWallClockToISO(date, start);
    const endISO = businessWallClockToISO(date, end);
    if (!startISO || !endISO) return setError("Pick a date, start and end time.");
    if (Date.parse(endISO) <= Date.parse(startISO)) return setError("End time must be after the start time.");
    if (!editing && contact && !contact.email) {
      return setError("That contact has no email address, so they can't be booked as the client. Add one on their contact page, or leave the client blank.");
    }

    setSaving(true);
    try {
      let res: Response;
      if (editing) {
        const body: Record<string, unknown> = {
          title: title.trim(),
          start_time: startISO,
          end_time: endISO,
          notes,
          notify,
        };
        if (!isVideo) body.location = location;
        if (host) body.host_email = host;
        res = await fetch(`/api/appointments/${appt!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            start_time: startISO,
            end_time: endISO,
            description: notes || undefined,
            location: location || undefined,
            host_email: host || undefined,
            timeZone: "Australia/Brisbane",
            ...(contact
              ? {
                  contact_id: contact.id,
                  contact_email: contact.email,
                  contact_name: contactLabel(contact),
                  send_invite: notify,
                }
              : {}),
          }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      onSaved(data.notify_warning ?? data.invite_warning ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{editing ? "Change appointment" : "New appointment"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 -mr-1" aria-label="Close">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Title</span>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Strategy call, site visit" autoFocus />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block col-span-3 sm:col-span-1">
              <span className="text-xs font-medium text-gray-600">Date</span>
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Start</span>
              <input type="time" step={300} className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">End</span>
              <input type="time" step={300} className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 -mt-1">
            {DURATIONS.map((m) => (
              <button key={m} type="button" onClick={() => setDuration(m)}
                className="px-2 py-0.5 rounded-full border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
                {m < 60 ? `${m} min` : `${m / 60} hr`}
              </button>
            ))}
            <span className="text-xs text-gray-400 self-center ml-1">Brisbane time</span>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">With (host)</span>
            <select className={inputCls} value={host} onChange={(e) => setHost(e.target.value)}>
              <option value="">{editing ? "Unchanged" : "Me (signed-in user)"}</option>
              {hosts.map((h) => <option key={h.email} value={h.email}>{h.displayName}</option>)}
            </select>
          </label>

          {editing ? (
            <p className="text-xs text-gray-600">
              Client: <span className="font-medium text-gray-800">{appt!.contact_name || appt!.contact_email || "none (diary entry)"}</span>
            </p>
          ) : (
            <div className="relative">
              <span className="text-xs font-medium text-gray-600">Client (optional)</span>
              {contact ? (
                <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                  <span>{contactLabel(contact)}{contact.email ? <span className="text-gray-400"> · {contact.email}</span> : null}</span>
                  <button type="button" onClick={() => setContact(null)} className="text-xs text-gray-500 hover:text-gray-800">Remove</button>
                </div>
              ) : (
                <>
                  <input
                    className={inputCls}
                    placeholder={contacts === null ? "Loading contacts…" : "Search name, email or phone. Leave blank for a diary entry"}
                    value={contactQuery}
                    onChange={(e) => { setContactQuery(e.target.value); setShowPicker(true); }}
                    onFocus={() => setShowPicker(true)}
                  />
                  {showPicker && contactQuery.trim() && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {matches.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">No matching contact.</p>
                      ) : matches.map((c) => (
                        <button key={c.id} type="button"
                          onClick={() => { setContact(c); setShowPicker(false); setContactQuery(""); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50">
                          <span className="block text-sm text-gray-900">{contactLabel(c)}</span>
                          <span className="block text-xs text-gray-500">{c.email || "no email"}{c.phone ? ` · ${c.phone}` : ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {isVideo ? (
            <p className="text-xs text-gray-500">📹 Video meeting. The join link stays the same and is renewed if you move the time.</p>
          ) : (
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Location (optional)</span>
              <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="Address, phone, etc." />
              {!editing && contact && (
                <span className="block text-xs text-gray-400 mt-1">Meetings with a client also get a video link.</span>
              )}
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Notes</span>
            <textarea rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {hasClientEmail && (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-0.5" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <span>
                {editing
                  ? "Email the client the updated time and details (their calendar entry moves)"
                  : "Email the client an invite with a calendar attachment"}
              </span>
            </label>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Close</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
            {saving ? "Saving…" : editing ? "Save changes" : "Add to diary"}
          </button>
        </div>
      </div>
    </div>
  );
}
