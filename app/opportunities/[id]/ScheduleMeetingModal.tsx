"use client";

/**
 * In-CRM Google Calendar event creation. Drops the bounce-to-Google
 * eventedit URL flow in favour of a real form that POSTs to
 * /api/calendar/events. Server-side uses the host's stored refresh
 * token to create the event with a Google Meet link, and Google sends
 * the invite to the attendee on save.
 */
import { useEffect, useMemo, useState } from "react";

type Lead = {
  lead_id: string;
  full_name: string | null;
  email: string | null;
  buyer_type: string | null;
  state: string | null;
  budget: string | null;
  timeframe: string | null;
  message: string | null;
};

type Host = { email: string; label: string };

const DURATIONS = [15, 30, 45, 60, 90];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

// Round up to the next 15-minute slot, returning {date: "YYYY-MM-DD", time: "HH:MM"}
function defaultStart(): { date: string; time: string } {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  if (now.getHours() < 8) { now.setHours(9, 0, 0, 0); }
  if (now.getHours() >= 18) {
    now.setDate(now.getDate() + 1);
    now.setHours(9, 0, 0, 0);
  }
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

// Build an ISO string with the local timezone offset attached, so the
// server treats it as a definite instant rather than a floating wall
// time. e.g. "2026-05-10T14:00:00+10:00"
function toIsoWithOffset(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  // Manually compute offset string (Date#toISOString returns UTC, no offset)
  const tzMin = -dt.getTimezoneOffset();
  const sign = tzMin >= 0 ? "+" : "-";
  const tzH = pad(Math.floor(Math.abs(tzMin) / 60));
  const tzM = pad(Math.abs(tzMin) % 60);
  return `${date}T${time}:00${sign}${tzH}:${tzM}`;
}

export default function ScheduleMeetingModal({
  lead,
  hosts,
  onClose,
}: {
  lead: Lead;
  hosts: Host[];
  onClose: () => void;
}) {
  const def = useMemo(defaultStart, []);
  const [hostEmail, setHostEmail] = useState(hosts[0]?.email ?? "");
  const [date, setDate] = useState(def.date);
  const [time, setTime] = useState(def.time);
  const [duration, setDuration] = useState(30);
  const [title, setTitle] = useState(`Meeting — ${lead.full_name || "NextKey lead"}`);
  const [attendeeEmail, setAttendeeEmail] = useState(lead.email ?? "");
  const [description, setDescription] = useState(() =>
    [
      lead.full_name && `Lead: ${lead.full_name}`,
      lead.buyer_type && `Buyer type: ${lead.buyer_type}`,
      lead.state && `State: ${lead.state}`,
      lead.budget && `Budget: ${lead.budget}`,
      lead.timeframe && `Timeframe: ${lead.timeframe}`,
      lead.message && `\nMessage: ${lead.message}`,
    ].filter(Boolean).join("\n")
  );
  const [sendInvite, setSendInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ htmlLink: string; hangoutLink?: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const start = toIsoWithOffset(date, time);
      const endDate = new Date(start);
      endDate.setMinutes(endDate.getMinutes() + duration);
      const end = endDate.toISOString().replace(/\.\d{3}Z$/, "+00:00"); // ISO + offset

      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host_email: hostEmail,
          summary: title,
          description,
          start,
          end,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          attendees: attendeeEmail
            ? [{ email: attendeeEmail, displayName: lead.full_name || undefined }]
            : [],
          sendUpdates: sendInvite ? "all" : "none",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "not_connected") {
          throw new Error(`${hostEmail} hasn't connected their calendar yet. Settings → Calendar connections → Connect.`);
        }
        throw new Error(data.error || `Failed (${res.status})`);
      }
      setSuccess({ htmlLink: data.event.htmlLink, hangoutLink: data.event.hangoutLink });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-10">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">📅 Schedule meeting</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 text-lg leading-none">✕</button>
        </div>

        {success ? (
          <div className="p-6 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
              ✓ Meeting scheduled. Invite sent to {attendeeEmail || "you only"}.
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <a href={success.htmlLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Open in Google Calendar →
              </a>
              {success.hangoutLink && (
                <a href={success.hangoutLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Join via Google Meet →
                </a>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-full mt-2 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Host calendar</label>
              <select
                value={hostEmail}
                onChange={(e) => setHostEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {hosts.map((h) => (
                  <option key={h.email} value={h.email}>{h.label} ({h.email})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required step={300}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Duration</label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDuration(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      duration === m
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Attendee email</label>
              <input type="email" value={attendeeEmail} onChange={(e) => setAttendeeEmail(e.target.value)}
                placeholder="lead@example.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              Send invite email to attendee
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} disabled={submitting}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition">
                {submitting ? "Scheduling…" : "Schedule meeting"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
