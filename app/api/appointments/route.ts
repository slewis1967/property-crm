import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth, userEmailFromRequest } from "../../../utils/cf-access";
import {
  createCalendarEvent,
  getOAuthConfig,
  refreshAccessToken,
} from "../../../utils/google-oauth";

/**
 * Create an appointment from inside the CRM (e.g. from NewOpportunityModal).
 *
 * Orchestrates two writes:
 *   1. Google Calendar event on the host's primary calendar — gets a
 *      Google Meet link auto-attached and (if invite_contact) sends a
 *      calendar invite to the contact's email.
 *   2. Supabase `appointments` row so the appointment shows up in the
 *      CRM's /appointments view + contact/opportunity detail panels
 *      alongside Cal.com-synced bookings.
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

type Body = {
  contact_id: string;
  contact_email: string;
  contact_name?: string;
  title: string;
  start_time: string;       // ISO datetime (with or without offset)
  end_time?: string;        // ISO; defaults to start + 60 min if omitted
  notes?: string;
  location?: string;
  invite_contact?: boolean; // default true
};

const DEFAULT_DURATION_MIN = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const host_email = userEmailFromRequest(req);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate
  if (!body.contact_id || !UUID_RE.test(body.contact_id)) {
    return NextResponse.json({ error: "Valid contact_id (UUID) is required" }, { status: 400 });
  }
  if (!body.contact_email || !EMAIL_RE.test(body.contact_email)) {
    return NextResponse.json({ error: "Valid contact_email is required" }, { status: 400 });
  }
  if (!body.title || !body.title.trim()) {
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
  const inviteContact = body.invite_contact !== false; // default true

  // --- Step 1: Google Calendar (best-effort) ---
  let calendarId: string | null = null;
  let calendarLink: string | null = null;
  let hangoutLink: string | null = null;
  let calendarWarning: string | null = null;

  try {
    // Throws if env vars aren't set — caught below
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
        summary: body.title.trim(),
        description: body.notes?.trim() || undefined,
        location: body.location?.trim() || undefined,
        start: startISO,
        end: endISO,
        attendees: inviteContact
          ? [{ email: body.contact_email, displayName: body.contact_name }]
          : undefined,
        sendUpdates: inviteContact ? "all" : "none",
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
  const insertRow: Record<string, unknown> = {
    contact_id: body.contact_id,
    contact_email: body.contact_email,
    title: body.title.trim(),
    start_time: startISO,
    end_time: endISO,
    notes: body.notes?.trim() || null,
    location: body.location?.trim() || hangoutLink || null,
    appointment_status: "scheduled",
    host_name: host_email,
    calendar_id: calendarId,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("appointments")
    .insert(insertRow)
    .select("id,title,start_time,end_time,appointment_status,calendar_id,location,notes,host_name,contact_id,contact_email")
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
