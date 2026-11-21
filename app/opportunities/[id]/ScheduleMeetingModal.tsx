"use client";

/**
 * In-CRM appointment scheduler. POSTs to /api/appointments, which writes the
 * Supabase `appointments` row (the CRM's own calendar — no Google), mints a
 * self-hosted LiveKit video link for the meeting, and emails every attendee a
 * branded invite with an .ics attachment, plus a text to each mobile.
 *
 * Three types: video call, phone call, and on-site inspection. An inspection
 * has no video link and needs the property address, which goes into the
 * invite, the calendar file and the text.
 *
 * The invite email is best-effort: if it can't be sent, the meeting is still
 * saved and the modal surfaces that the attendee wasn't notified so it can be
 * followed up manually.
 */
import { useMemo, useState } from "react";
import { errMessage } from "../../../utils/errors";
import { roomForContact } from "../../../utils/livekit-rooms";

type Lead = {
  lead_id: string;
  full_name: string | null;
  email: string | null;
  /** The client's mobile, to pre-fill the first attendee. Optional: the server
   * falls back to the contact's mobile on file. */
  phone?: string | null;
  buyer_type: string | null;
  state: string | null;
  budget: string | null;
  timeframe: string | null;
  message: string | null;
};

type Host = { email: string; label: string };

type Kind = "video" | "phone" | "inspection";

type AttendeeRow = { key: number; name: string; email: string; phone: string };

const KIND_LABEL: Record<Kind, string> = {
  video: "🎥 Video call",
  phone: "📞 Phone call",
  inspection: "🏠 On-site inspection",
};

function defaultTitle(kind: Kind, name: string | null): string {
  const who = name || "NextKey lead";
  return kind === "phone" ? `Phone call — ${who}` : kind === "inspection" ? `Inspection — ${who}` : `Meeting — ${who}`;
}

/** Loose AU mobile check, matching what the server will accept for a text. */
function looksLikeMobile(raw: string): boolean {
  const d = raw.replace(/[^\d+]/g, "");
  return /^(\+?61|0)?4\d{8}$/.test(d);
}

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
  defaultKind = "video",
  onClose,
  onCreated,
}: {
  lead: Lead;
  hosts: Host[];
  /** Supabase contacts.id for this lead's primary contact — required for the
   * /api/appointments insert. If null (lead with no matched contact),
   * scheduling is disabled with a soft message. */
  contactId: string | null;
  /** Pre-selects the meeting type — e.g. the "📞 Phone call" quick action
   * opens straight into the phone flow instead of making the operator
   * switch it every time. */
  defaultKind?: Kind;
  onClose: () => void;
  /** Optional: called after a successful save so the parent can refresh
   * the appointments panel without a full page reload. */
  onCreated?: () => void;
}) {
  const def = useMemo(() => defaultStart(), []);
  const [kind, setKindState] = useState<Kind>(defaultKind);
  const [hostEmail, setHostEmail] = useState(hosts[0]?.email ?? "");
  const [date, setDate] = useState(def.date);
  const [time, setTime] = useState(def.time);
  const [duration, setDuration] = useState(30);
  const [title, setTitle] = useState(defaultTitle(defaultKind, lead.full_name));
  const [address, setAddress] = useState("");
  const [attendees, setAttendees] = useState<AttendeeRow[]>([
    { key: 0, name: lead.full_name ?? "", email: lead.email ?? "", phone: lead.phone ?? "" },
  ]);
  const [nextKey, setNextKey] = useState(1);

  // Switching type re-titles the meeting, unless the title was typed by hand.
  const setKind = (k: Kind) => {
    if (title === defaultTitle(kind, lead.full_name)) setTitle(defaultTitle(k, lead.full_name));
    setKindState(k);
  };
  const updateAttendee = (key: number, field: "name" | "email" | "phone", value: string) =>
    setAttendees((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const addAttendee = () => {
    setAttendees((rows) => [...rows, { key: nextKey, name: "", email: "", phone: "" }]);
    setNextKey((n) => n + 1);
  };
  const removeAttendee = (key: number) => setAttendees((rows) => rows.filter((r) => r.key !== key));
  const filledAttendees = attendees.filter((a) => a.email.trim() || a.phone.trim());
  const notifyNames = filledAttendees.map((a) => a.name.trim() || a.email.trim() || a.phone.trim());
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
  const [warning, setWarning] = useState<string | null>(null); // invite_warning from API
  const [success, setSuccess] = useState<{
    videoLink?: string | null;
    inviteRequested: boolean;
    inviteSent: boolean;
    smsCount: number;
    smsOk: number;
  } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setWarning(null);
    if (!contactId) {
      setError("This lead has no matched contact in the CRM — can't link an appointment to it.");
      return;
    }
    if (kind === "inspection" && !address.trim()) {
      setError("Add the property address for the on-site inspection.");
      return;
    }
    for (const a of attendees) {
      const label = a.name.trim() || a.email.trim() || "An attendee";
      if (a.phone.trim() && !looksLikeMobile(a.phone)) {
        setError(`${label}: "${a.phone}" isn't an Australian mobile number, so they can't be texted.`);
        return;
      }
      if (a.name.trim() && !a.email.trim() && !a.phone.trim()) {
        setError(`${label} needs an email or a mobile so they can be notified.`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const start = toIsoWithOffset(date, time);
      const endDate = new Date(start);
      endDate.setMinutes(endDate.getMinutes() + duration);
      const end = endDate.toISOString().replace(/\.\d{3}Z$/, "+00:00"); // ISO + offset

      // Books the meeting in the CRM's own calendar, mints the LiveKit video
      // link, and emails the attendee an invite (with .ics) via Brevo.
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          // The first attendee is the client: their email is the row's contact.
          contact_email: attendees[0]?.email.trim() || lead.email,
          contact_name: lead.full_name || undefined,
          host_email: hostEmail,
          title,
          description,
          start_time: start,
          end_time: end,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          location: kind === "inspection" ? address.trim() : undefined,
          attendees: filledAttendees.map((a) => ({
            email: a.email.trim() || undefined,
            displayName: a.name.trim() || undefined,
            phone: a.phone.trim() || undefined,
          })),
          send_invite: sendInvite,
          meeting_kind: kind,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      // Surfaces when the invite email couldn't be sent — the meeting still
      // landed in the CRM, but if we promised the attendee an invite, nobody
      // got one. The result panel says so.
      // Texts that didn't go (opted out, no mobile, provider error) are shown too.
      const warn = [data.invite_warning, data.sms_warning].filter(Boolean).join(" ");
      if (warn) setWarning(warn);
      setSuccess({
        videoLink: data.video_link,
        inviteRequested: !!data.invite_requested,
        inviteSent: !!data.invite_sent,
        smsCount: Number(data.sms_count ?? 0),
        smsOk: Number(data.sms_ok ?? 0),
      });
      onCreated?.();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const emailList = filledAttendees.map((a) => a.email.trim()).filter(Boolean).join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-10">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {kind === "phone" ? "📞 Log phone call" : kind === "inspection" ? "🏠 Book on-site inspection" : "📅 Schedule meeting"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 text-lg leading-none">✕</button>
        </div>

        {success ? (
          <div className="p-6 space-y-4">
            {success.inviteSent ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                {kind === "phone"
                  ? `✓ Call logged. Confirmation emailed to ${emailList}.`
                  : kind === "inspection"
                    ? `✓ Inspection booked. Details emailed to ${emailList}.`
                    : `✓ Meeting scheduled. Invite emailed to ${emailList}.`}
              </div>
            ) : success.inviteRequested ? (
              // The row saved, but we told the user we'd email the attendee and
              // didn't. Never dress this as a success — it needs manual follow-up.
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                <div className="font-semibold">
                  {kind === "phone" ? "Confirmation NOT sent" : "Invite NOT sent"} to everyone.
                </div>
                <div className="mt-1 text-xs">
                  {kind !== "video"
                    ? "It's saved in the CRM calendar, but not every email went out. See below for who missed out, and follow up with them manually."
                    : <>The meeting is saved in the CRM calendar, but the invite email
                    didn&rsquo;t go out. Send the join link below to the attendee
                    manually, or reschedule.</>}
                </div>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                {kind === "phone"
                  ? "✓ Call added to the calendar. No confirmation was sent, as requested."
                  : "✓ Added to the calendar. No invite was sent, as requested."}
              </div>
            )}
            {success.smsCount > 0 && (
              <div className={`rounded-xl px-4 py-3 text-sm border ${
                success.smsOk === success.smsCount
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-amber-50 border-amber-200 text-amber-800"
              }`}>
                📱 {success.smsOk} of {success.smsCount} text{success.smsCount === 1 ? "" : "s"} sent.
              </div>
            )}
            {warning && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                ⚠ {warning}
              </div>
            )}
            {success.videoLink && (
              <div className="flex flex-col gap-2 text-sm">
                {/* Two different doors on purpose: you join at the authed room
                    page, the client uses the guest link below. Clicking the
                    guest link yourself puts you in the call under the client's
                    name. */}
                {contactId && (
                  <a
                    href={`/video/${roomForContact(contactId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-700 hover:underline font-medium"
                  >
                    📹 Join the video meeting →
                  </a>
                )}
                <p className="text-xs text-gray-500">
                  Link sent to the attendee:
                  <br />
                  <span className="break-all">{success.videoLink}</span>
                </p>
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
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
              <div className="flex flex-wrap gap-2">
                {(["video", "phone", "inspection"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border transition ${
                      kind === k
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              {kind === "phone" && (
                <p className="mt-1.5 text-xs text-gray-500">
                  No video link is sent — just a confirmation email for the call.
                </p>
              )}
              {kind === "inspection" && (
                <p className="mt-1.5 text-xs text-gray-500">
                  An in-person visit to the property. Everyone gets the address by email and text.
                </p>
              )}
            </div>

            {kind === "inspection" && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Property address</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} required
                  placeholder="e.g. 12 Example St, Palm Beach QLD 4221"
                  autoComplete="street-address"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Meeting host</label>
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
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Attendees</label>
              <div className="space-y-2">
                {attendees.map((a, i) => (
                  <div key={a.key} className="rounded-xl border border-gray-200 p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={a.name} onChange={(e) => updateAttendee(a.key, "name", e.target.value)}
                        placeholder={i === 0 ? "Client name" : "Name"}
                        aria-label={`Attendee ${i + 1} name`}
                        className="flex-1 min-w-0 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      {i === 0 ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">Client</span>
                      ) : (
                        <button type="button" onClick={() => removeAttendee(a.key)}
                          aria-label={`Remove attendee ${i + 1}`}
                          className="text-gray-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 text-sm leading-none">✕</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="email" value={a.email} onChange={(e) => updateAttendee(a.key, "email", e.target.value)}
                        placeholder="Email"
                        aria-label={`Attendee ${i + 1} email`}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="tel" value={a.phone} onChange={(e) => updateAttendee(a.key, "phone", e.target.value)}
                        placeholder={i === 0 ? "Mobile (blank = on file)" : "Mobile"}
                        aria-label={`Attendee ${i + 1} mobile`}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addAttendee}
                className="mt-2 text-sm font-semibold text-blue-600 hover:text-blue-800">
                + Add attendee
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              {`Send ${kind === "phone" ? "confirmation" : "invite"} email and text to ${
                notifyNames.length > 1 ? `all ${notifyNames.length} attendees` : "the attendee"
              }`}
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
                {submitting
                  ? (kind === "phone" ? "Logging…" : kind === "inspection" ? "Booking…" : "Scheduling…")
                  : (kind === "phone" ? "Log call" : kind === "inspection" ? "Book inspection" : "Schedule meeting")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
