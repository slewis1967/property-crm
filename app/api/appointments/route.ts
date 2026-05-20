import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth, userEmailFromRequest } from "../../../utils/cf-access";
import {
  createCalendarEvent,
  getOAuthConfig,
  refreshAccessToken,
} from "../../../utils/google-oauth";

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
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const currentUser = userEmailFromRequest(req);

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
        description,
        location,
        start: startISO,
        end: endISO,
        timeZone: body.timeZone,
        attendees,
        sendUpdates,
      });
      calendarId = event.id;
      calendarLink = event.htmlLink;
      hangoutLink = event.hangoutLink ?? null;
    }
  } catch (e: any) {
    // Don't fail the request — fall back to CRM-only and report the warning
    calendarWarning = `Google Calendar step failed (${e.message || "unknown"}). Appointment saved to CRM only.`;
  }

  // --- Step 2: Supabase appointments row (authoritative for the CRM) ---
  // Populates BOTH column-name conventions in use across the codebase so a
  // row written here shows up in every read path:
  //   - title + appointment_status — used by /appointments page, contact &
  //     opportunity detail pages, ContactDetail's appointments prop, etc.
  //   - event_title + status — used by OpportunityAppointments (the panel
  //     directly under the opp summary) which queries Cal.com-shaped rows.
  const insertRow: Record<string, unknown> = {
    contact_id: body.contact_id,
    contact_email: body.contact_email,
    title,
    event_title: title,
    start_time: startISO,
    end_time: endISO,
    notes: description ?? null,
    location: location ?? hangoutLink ?? null,
    appointment_status: "scheduled",
    status: "scheduled",
    host_name: host_email,
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

  return NextResponse.json({
    appointment: inserted,
    calendar_event: calendarId
      ? { id: calendarId, htmlLink: calendarLink, hangoutLink }
      : null,
    calendar_warning: calendarWarning,
  });
}
