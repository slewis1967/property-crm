"use client";

/**
 * In-CRM appointment scheduler. POSTs to /api/appointments — the unified
 * orchestrator route that BOTH creates a Google Calendar event (with
 * Meet link + attendee invite, via the host's stored refresh token) AND
 * writes a Supabase `appointments` row so the booking shows up in the
 * opp's Appointments list, the /appointments page, and contact panels.
 * Previously this modal hit /api/calendar/events directly, which left
 * the calendar event un-tracked in the CRM.
 *
 * Calendar step is best-effort: if the host hasn't connected their
 * calendar yet (or OAuth env isn't configured), the appointment is
 * still saved to the CRM and the modal surfaces a soft warning.
 */
import { useMemo, useState } from "react";
import { errMessage } from "../../../utils/errors";

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
  contactId,
  onClose,
  onCreated,
}: {
  lead: Lead;
  hosts: Host[];
  /** Supabase contacts.id for this lead's primary contact — required for the
   * /api/appointments insert. If null (lead with no matched contact),
   * scheduling is disabled with a soft message. */
  contactId: string | null;
  onClose: () => void;
  /** Optional: called after a successful save so the parent can refresh
   * the appointments panel without a full page reload. */
  onCreated?: () => void;
}) {
  const def = useMemo(() => defaultStart(), []);
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
  const [warning, setWarning] = useState<string | null>(null); // calendar_warning from API
  const [success, setSuccess] = useState<{
    htmlLink?: string;
    hangoutLink?: string;
    inviteRequested: boolean;
    inviteSent: boolean;
  } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setWarning(null);
    if (!contactId) {
      setError("This lead has no matched contact in the CRM — can't link an appointment to it.");
      return;
    }
    setSubmitting(true);
    try {
      const start = toIsoWithOffset(date, time);
      const endDate = new Date(start);
      endDate.setMinutes(endDate.getMinutes() + duration);
      const end = endDate.toISOString().replace(/\.\d{3}Z$/, "+00:00"); // ISO + offset

      // Unified appointment endpoint: creates the Google Cal event (with Meet
      // link + attendee invite) AND inserts the Supabase appointments row, so
      // the booking surfaces in the opp's Appointments panel without waiting
      // on any external sync.
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          contact_email: attendeeEmail || lead.email,
          contact_name: lead.full_name || undefined,
          host_email: hostEmail,
          title,
          description,
          start_time: start,
          end_time: end,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          attendees: attendeeEmail
            ? [{ email: attendeeEmail, displayName: lead.full_name || undefined }]
            : [],
          sendUpdates: sendInvite ? "all" : "none",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      // Surfaces when the calendar leg couldn't run (no host creds, OAuth not
      // configured, etc.) — the Supabase row still landed, but if we promised
      // the attendee an invite, nobody sent one. The result panel says so.
      if (data.calendar_warning) setWarning(data.calendar_warning);
      setSuccess({
        htmlLink: data.calendar_event?.htmlLink,
        hangoutLink: data.calendar_event?.hangoutLink,
        inviteRequested: !!data.invite_requested,
        inviteSent: !!data.invite_sent,
      });
      onCreated?.();
    } catch (e) {
      setError(errMessage(e));
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
            {success.inviteSent ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                ✓ Meeting scheduled. Invite sent to {attendeeEmail}.
              </div>
            ) : success.inviteRequested ? (
              // The row saved, but we told the user we'd email the attendee and
              // didn't. Never dress this as a success — it needs manual follow-up.
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                <div className="font-semibold">Invite NOT sent to {attendeeEmail}.</div>
                <div className="mt-1 text-xs">
                  The meeting is saved in the CRM, but nothing reached the attendee.
                  Connect this host&rsquo;s calendar in Settings, then send the invite
                  manually or reschedule.
                </div>
              </div>
            ) : success.htmlLink ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                ✓ Meeting added to the calendar. No invite was sent, as requested.
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                Saved to CRM only — no calendar event was created.
              </div>
            )}
            {warning && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                ⚠ {warning}
              </div>
            )}
            {(success.htmlLink || success.hangoutLink) && (
              <div className="flex flex-col gap-2 text-sm">
                {success.htmlLink && (
                  <a href={success.htmlLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Open in Google Calendar →
                  </a>
                )}
                {success.hangoutLink && (
                  <a href={success.hangoutLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Join via Google Meet →
                  </a>
                )}
              </div>
            )}
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
