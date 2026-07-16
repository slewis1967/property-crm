import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth, userEmailFromRequest } from "../../../utils/cf-access";
import { findHost } from "../../../utils/scheduling-hosts";
import { errMessage } from "../../../utils/errors";
import {
  createCalendarEvent,
  getOAuthConfig,
  refreshAccessToken,
} from "../../../utils/google-oauth";
import { roomForContact, livekitConfigured } from "../../../utils/livekit";
import { signGuestToken } from "../../../utils/guest-token";

/**
 * Create an appointment from inside the CRM.
 *
 * Callers:
 *   - NewOpportunityModal "+ Schedule appointment" inline section
 *   - OpportunityDetail's "📅 Schedule meeting" button (ScheduleMeetingModal)
 *
 * Orchestrates two writes:
 *   1. Google Calendar event on the host's primary calendar — gets a
 *      Google Meet link auto-attached and (if attendees are present)
 *      sends a calendar invite to them via sendUpdates.
 *   2. Supabase `appointments` row so the appointment shows up in the
 *      CRM's /appointments view + contact/opportunity detail panels
 *      alongside Cal.com-synced bookings. We write BOTH column-name
 *      conventions used in the codebase (title+appointment_status AND
 *      event_title+status) so reads from either side see the row.
 *
 * The Google Calendar step is best-effort. If GOOGLE_OAUTH_CLIENT_ID is
 * not set, or this host hasn't connected their calendar from /settings,
 * we still insert the Supabase row and return a `calendar_warning`. The
 * CRM-side record is the primary artefact; the calendar event is an
 * enrichment.
 *
 * Failure to insert the Supabase row is hard-error (the calendar event,
 * if created, is left orphaned — acceptable trade since the row is what
 * the rest of the CRM reads).
 */

type Attendee = { email: string; displayName?: string };

type Body = {
  // Linkage (CRM-side)
  contact_id: string;
  contact_email: string;
  contact_name?: string;

  // Calendar event details
  title: string;
  start_time: string;       // ISO datetime (with or without offset)
  end_time?: string;        // ISO; defaults to start + DEFAULT_DURATION_MIN if omitted
  description?: string;     // primary body text; falls back to `notes`
  notes?: string;           // legacy alias accepted for backward compat
  location?: string;
  timeZone?: string;        // forwarded to Google Cal (defaults Australia/Brisbane in helper)

  // Host / attendees
  host_email?: string;      // calendar owner; defaults to current authenticated user
  invite_contact?: boolean; // default true — adds contact_email as attendee
  attendees?: Attendee[];   // explicit override; replaces invite_contact-derived list
  sendUpdates?: "all" | "externalOnly" | "none"; // override; otherwise derived from attendees
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

  // Resolve attendees: explicit override > invite_contact toggle > default invite the contact.
  let attendees: Attendee[] | undefined;
  if (body.attendees && Array.isArray(body.attendees)) {
    attendees = body.attendees.filter((a) => a?.email && EMAIL_RE.test(a.email));
  } else if (body.invite_contact !== false) {
    attendees = [{ email: body.contact_email, displayName: body.contact_name }];
  }
  const sendUpdates: "all" | "externalOnly" | "none" =
    body.sendUpdates ?? (attendees && attendees.length > 0 ? "all" : "none");

  // --- Self-hosted LiveKit video link for this meeting (in place of Google
  // Meet). Reuses the contact's room so ad-hoc "Video call" clicks and
  // scheduled meetings share it and both land on the contact's video timeline.
  // The guest link is a signed, expiring token — give it a TTL that comfortably
  // covers the meeting time. Best-effort: if LiveKit isn't configured or signing
  // fails, we fall back to a Google Meet link so a meeting always has video. ---
  let videoLink: string | null = null;
  if (livekitConfigured()) {
    try {
      const room = roomForContact(body.contact_id);
      const hoursUntilEnd = Math.ceil((endMs - Date.now()) / 3_600_000);
      const ttlHours = Math.max(24, hoursUntilEnd + 6);
      const guestToken = await signGuestToken({
        room,
        name: body.contact_name,
        ttlHours,
      });
      videoLink = `${req.nextUrl.origin}/join/${encodeURIComponent(guestToken)}`;
    } catch {
      videoLink = null;
    }
  }

  // Put the join link at the top of the invite body so attendees can click it;
  // keep any operator-written description beneath.
  const meetingDescription = videoLink
    ? [`Join the video meeting: ${videoLink}`, description]
        .filter(Boolean)
        .join("\n\n")
    : description;

  // --- Step 1: Google Calendar (best-effort) ---
  let calendarId: string | null = null;
  let calendarLink: string | null = null;
  let hangoutLink: string | null = null;
  let calendarWarning: string | null = null;

  try {
    // Throws if OAuth env vars aren't set — caught below
    getOAuthConfig();

    const { data: cred, error: credErr } = await supabase
      .from("calendar_credentials")
      .select("refresh_token")
      .eq("host_email", host_email)
      .maybeSingle();

    if (credErr) throw new Error(`credentials lookup failed: ${credErr.message}`);
    if (!cred) {
      calendarWarning = `Google Calendar not connected for ${host_email} — connect it from /settings to enable invites. Appointment saved to CRM only.`;
    } else {
      const { accessToken } = await refreshAccessToken(cred.refresh_token);
      const event = await createCalendarEvent(accessToken, {
        summary: title,
        description: meetingDescription,
        // Surface the join link in the calendar's Location field too (unless a
        // physical location was given), so it's one click from the invite.
        location: location ?? videoLink ?? undefined,
        start: startISO,
        end: endISO,
        timeZone: body.timeZone,
        attendees,
        sendUpdates,
        // LiveKit replaces Google Meet when we have a link; otherwise keep Meet.
        addGoogleMeet: !videoLink,
      });
      calendarId = event.id;
      calendarLink = event.htmlLink;
      hangoutLink = event.hangoutLink ?? null;
    }
  } catch (e) {
    // Don't fail the request — fall back to CRM-only and report the warning
    calendarWarning = `Google Calendar step failed (${errMessage(e, "unknown")}). Appointment saved to CRM only.`;
  }

  // --- Step 2: Supabase appointments row (authoritative for the CRM) ---
  // Populates BOTH column-name conventions in use across the codebase so a
  // row written here shows up in every read path:
  //   - title + appointment_status — used by /appointments page, contact &
  //     opportunity detail pages, ContactDetail's appointments prop, etc.
  //   - event_title + status — used by OpportunityAppointments (the panel
  //     directly under the opp summary) which queries Cal.com-shaped rows.
  const host = findHost(host_email);
  const insertRow: Record<string, unknown> = {
    contact_id: body.contact_id,
    contact_email: body.contact_email,
    // Read by /api/ai/dashboard-brief but never written until now, so every
    // CRM-created booking showed up in the brief with a null contact name.
    contact_name: body.contact_name ?? null,
    title,
    event_title: title,
    start_time: startISO,
    end_time: endISO,
    notes: description ?? null,
    location: location ?? videoLink ?? hangoutLink ?? null,
    appointment_status: "scheduled",
    status: "scheduled",
    // host_email is read by the contact detail page; host_name carries the
    // human label where we have one, rather than repeating the address.
    host_email: host_email,
    host_name: host?.displayName ?? host_email,
    calendar_id: calendarId,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("appointments")
    .insert(insertRow)
    .select(
      "id,title,event_title,start_time,end_time,appointment_status,status," +
      "calendar_id,location,notes,host_name,contact_id,contact_email",
    )
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: `Failed to save appointment: ${insertErr.message}`, calendar_event_id: calendarId },
      { status: 500 },
    );
  }

  // The caller cannot infer this from calendar_event alone: an event may exist
  // while no invite went out (sendUpdates:"none", or no attendees). The UI
  // needs to know whether the client was actually emailed before it claims so.
  const inviteRequested = sendUpdates !== "none" && !!attendees?.length;
  const inviteSent = inviteRequested && !!calendarId;

  return NextResponse.json({
    appointment: inserted,
    calendar_event: calendarId
      ? { id: calendarId, htmlLink: calendarLink, hangoutLink }
      : null,
    // The self-hosted LiveKit join link included in the invite (null if LiveKit
    // wasn't configured and the meeting fell back to Google Meet).
    video_link: videoLink,
    invite_requested: inviteRequested,
    invite_sent: inviteSent,
    calendar_warning: calendarWarning,
  });
}
