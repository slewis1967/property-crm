import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth, userEmailFromRequest } from "../../../utils/cf-access";
import { findHost, SCHEDULING_HOSTS } from "../../../utils/scheduling-hosts";
import { errMessage } from "../../../utils/errors";
import { roomForContact, livekitConfigured } from "../../../utils/livekit";
import { signGuestToken } from "../../../utils/guest-token";
import { sendMeetingInvite } from "../../../utils/meeting-invite";
import { buildAppointmentRow, APPOINTMENT_READ_COLUMNS } from "../../../utils/appointments";

/**
 * Appointments API — the CRM's own calendar. No Google.
 *
 * POST — create a meeting:
 *   1. Mint a self-hosted LiveKit video link (`/join/<guest-token>`) reusing the
 *      contact's room, so scheduled meetings and ad-hoc "Video call" clicks land
 *      in the same room + on the contact's video timeline.
 *   2. Insert the Supabase `appointments` row — this IS the calendar. It's the
 *      authoritative record read by /calendar, /appointments, and the contact /
 *      opportunity detail panels. We write BOTH column conventions in the schema
 *      (title+appointment_status AND event_title+status) so every read path sees
 *      it.
 *   3. Email the attendee a branded invite via Brevo with the join link + an
 *      .ics attachment, so the meeting lands in whatever calendar they use.
 *      Best-effort: a failed send never loses the booking, but IS reported so
 *      the UI can tell the operator to follow up (we promised an invite).
 *
 * GET — list meetings in a date range (for the calendar grid):
 *   ?from=ISO&to=ISO[&contact_id=]  → { appointments: [...], hosts: [...] }
 *
 * Google Calendar was removed from this flow (2026-07). The old
 * calendar_credentials / OAuth path is gone; the .ics attachment replaces the
 * "add to my calendar" function Google used to provide.
 */

type Attendee = { email: string; displayName?: string };

type Body = {
  // Linkage (CRM-side)
  contact_id: string;
  contact_email: string;
  contact_name?: string;

  // Meeting details
  title: string;
  start_time: string;       // ISO datetime (with or without offset)
  end_time?: string;        // ISO; defaults to start + DEFAULT_DURATION_MIN if omitted
  description?: string;     // primary body text; falls back to `notes`
  notes?: string;           // legacy alias accepted for backward compat
  location?: string;        // physical location; ignored when a video link is minted
  timeZone?: string;        // IANA tz used to render the invite's human time

  // Host / attendees
  host_email?: string;      // meeting owner; defaults to current authenticated user
  invite_contact?: boolean; // default true — invites contact_email
  attendees?: Attendee[];   // explicit override; replaces invite_contact-derived list
  send_invite?: boolean;    // default true when there's an attendee — email the invite
};

const DEFAULT_DURATION_MIN = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const currentUser = await userEmailFromRequest(req);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // --- Validate ---
  if (!body.contact_id || !UUID_RE.test(body.contact_id)) {
    return NextResponse.json({ error: "Valid contact_id (UUID) is required" }, { status: 400 });
  }
  if (!body.contact_email || !EMAIL_RE.test(body.contact_email)) {
    return NextResponse.json({ error: "Valid contact_email is required" }, { status: 400 });
  }
  const title = (body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const startMs = Date.parse(body.start_time);
  if (!Number.isFinite(startMs)) {
    return NextResponse.json({ error: "start_time must be a valid ISO datetime" }, { status: 400 });
  }
  const endMs = body.end_time
    ? Date.parse(body.end_time)
    : startMs + DEFAULT_DURATION_MIN * 60_000;
  if (!Number.isFinite(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: "end_time must be after start_time" }, { status: 400 });
  }
  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(endMs).toISOString();
  const description = (body.description ?? body.notes ?? "").trim() || undefined;
  const location = body.location?.trim() || undefined;
  const host_email = (body.host_email && EMAIL_RE.test(body.host_email)) ? body.host_email : currentUser;
  const host = findHost(host_email) ?? {
    email: host_email,
    displayName: host_email,
    brand: "nextkey" as const,
  };

  // Resolve attendees: explicit override > invite_contact toggle > default invite the contact.
  let attendees: Attendee[] | undefined;
  if (body.attendees && Array.isArray(body.attendees)) {
    attendees = body.attendees.filter((a) => a?.email && EMAIL_RE.test(a.email));
  } else if (body.invite_contact !== false) {
    attendees = [{ email: body.contact_email, displayName: body.contact_name }];
  }
  const hasAttendee = !!(attendees && attendees.length > 0);
  const wantInvite = (body.send_invite ?? true) && hasAttendee;

  // --- Step 1: self-hosted LiveKit video link for this meeting ---
  // Reuses the contact's room so scheduled meetings and ad-hoc "Video call"
  // clicks share it and both land on the contact's video timeline. The guest
  // link is a signed, expiring token with a TTL that comfortably covers the
  // meeting. Best-effort: if LiveKit isn't configured or signing fails, the
  // meeting is still booked, just without a video link.
  let videoLink: string | null = null;
  if (livekitConfigured()) {
    try {
      const room = roomForContact(body.contact_id);
      const hoursUntilEnd = Math.ceil((endMs - Date.now()) / 3_600_000);
      const ttlHours = Math.max(24, hoursUntilEnd + 6);
      const guestToken = await signGuestToken({ room, name: body.contact_name, ttlHours });
      videoLink = `${req.nextUrl.origin}/join/${encodeURIComponent(guestToken)}`;
    } catch {
      videoLink = null;
    }
  }

  // --- Step 2: Supabase appointments row (authoritative — this IS the calendar) ---
  // The table is the legacy Cal.com shape (event_title / status / additional_notes
  // / NOT-NULL cal_uid); buildAppointmentRow is the single source of truth for
  // that shape so this can't drift into non-existent columns again.
  const { data: inserted, error: insertErr } = await supabase
    .from("appointments")
    .insert(buildAppointmentRow({
      contactId: body.contact_id,
      contactEmail: body.contact_email,
      contactName: body.contact_name ?? null,
      hostEmail: host_email,
      hostName: host.displayName ?? host_email,
      title,
      startISO,
      endISO,
      location: videoLink ?? location ?? null,
      notes: description ?? null,
    }))
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: `Failed to save appointment: ${insertErr.message}` },
      { status: 500 },
    );
  }

  // --- Step 3: Brevo invite with .ics (best-effort, but reported) ---
  let inviteSent = false;
  let inviteWarning: string | null = null;
  if (wantInvite) {
    const primary = attendees![0];
    const result = await sendMeetingInvite({
      to: { email: primary.email, name: primary.displayName },
      host,
      title,
      description,
      start: startISO,
      end: endISO,
      joinUrl: videoLink,
      location,
      uid: `appt-${(inserted as unknown as { id: string }).id}@nextkey.com.au`,
      tz: body.timeZone,
    });
    inviteSent = result.ok;
    if (!result.ok) {
      inviteWarning = `Invite email could not be sent (${result.error}). The meeting is saved — follow up with the attendee manually.`;
    }
  }

  return NextResponse.json({
    appointment: inserted,
    video_link: videoLink,
    invite_requested: wantInvite,
    invite_sent: inviteSent,
    invite_warning: inviteWarning,
  });
}

/**
 * List meetings in a date range for the calendar grid. Range is required so a
 * month view can't accidentally pull the whole table; capped at ~100 days.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = req.nextUrl;
  const fromMs = Date.parse(searchParams.get("from") ?? "");
  const toMs = Date.parse(searchParams.get("to") ?? "");
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return NextResponse.json({ error: "from and to (ISO) are required, to > from" }, { status: 400 });
  }
  if (toMs - fromMs > 100 * 86_400_000) {
    return NextResponse.json({ error: "range too wide (max 100 days)" }, { status: 400 });
  }
  const contactId = searchParams.get("contact_id");

  let q = supabase
    .from("appointments")
    .select(APPOINTMENT_READ_COLUMNS)
    .gte("start_time", new Date(fromMs).toISOString())
    .lt("start_time", new Date(toMs).toISOString())
    .order("start_time", { ascending: true })
    .limit(1000);
  if (contactId && UUID_RE.test(contactId)) q = q.eq("contact_id", contactId);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: errMessage(error) }, { status: 500 });
  }
  return NextResponse.json({ appointments: data ?? [], hosts: SCHEDULING_HOSTS });
}
