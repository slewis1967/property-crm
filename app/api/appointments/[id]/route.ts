import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth, userEmailFromRequest } from "../../../../utils/cf-access";
import { findHost } from "../../../../utils/scheduling-hosts";
import { guestJoinOrigin, rehostJoinLink } from "../../../../utils/springboard-book-host";
import { errMessage } from "../../../../utils/errors";
import { roomForContact, livekitConfigured } from "../../../../utils/livekit";
import { signGuestToken } from "../../../../utils/guest-token";
import { sendMeetingInvite } from "../../../../utils/meeting-invite";
import { log } from "../../../../utils/logger";
import { sendSms, isOptedOut } from "../../../../utils/sms";
import { meetingSmsBody } from "../../../../utils/meeting-sms";
import {
  emailRecipients,
  readAppointmentPayload,
  smsRecipients,
  type AppointmentPayload,
} from "../../../../utils/appointment-attendees";
import {
  APPOINTMENT_READ_COLUMNS,
  APPOINTMENT_STATUS_CANCELLED,
  APPOINTMENT_STATUS_RESCHEDULED,
  appointmentIcsUid,
  nextIcsSequence,
  validateAppointmentPatch,
} from "../../../../utils/appointments";

/**
 * One diary entry: change it (PATCH) or cancel/delete it (DELETE).
 *
 * Attendee emails: when the meeting has attendees and `notify` is not false,
 * every one of them gets an updated or cancelled calendar invite under the SAME
 * .ics uid as the original, so their calendar moves or removes the entry instead
 * of adding a duplicate. The attendee list comes from the row's raw_payload
 * (CRM bookings since Nov 2026); older rows fall back to contact_email. When
 * MEETING_SMS_ENABLED, everyone with a mobile also gets a text. Best-effort and
 * reported, like the original invite: a failed email or text never loses the
 * change, but the UI is told so someone follows up.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Row = {
  id: string;
  event_title: string | null;
  start_time: string;
  end_time: string | null;
  status: string | null;
  location: string | null;
  notes: string | null;
  host_name: string | null;
  host_email: string | null;
  contact_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
  raw_payload?: unknown;
};

async function loadRow(id: string): Promise<Row | null> {
  const { data } = await supabase
    .from("appointments")
    .select(`${APPOINTMENT_READ_COLUMNS},raw_payload`)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as Row | null) ?? null;
}

function hostFor(email: string | null) {
  const e = email ?? "";
  return findHost(e) ?? { email: e, displayName: e, brand: "nextkey" as const };
}

/** The client's signed LiveKit guest link (what a video meeting stores in `location`). */
function isGuestLink(loc: string | null): boolean {
  return !!loc && /^https?:\/\/[^/]+\/join\//.test(loc);
}

/** Email (and text) every attendee an update or cancellation. */
async function notifyAttendee(
  row: Row,
  kind: "update" | "cancel",
): Promise<{ sent: boolean; warning: string | null }> {
  const payload: AppointmentPayload | null = readAppointmentPayload(row.raw_payload);
  const medium = payload?.meeting_kind ?? (row.location === "Phone call" ? "phone" : "video");
  // Older rows (before the attendee list was stored) only know contact_email.
  const attendees = payload?.attendees.length
    ? payload.attendees
    : EMAIL_RE.test(row.contact_email ?? "")
      ? [{ email: row.contact_email!, name: row.contact_name, phone: null }]
      : [];
  const invitees = emailRecipients(attendees);
  const host = hostFor(row.host_email);
  const video = isGuestLink(row.location);
  const uid = appointmentIcsUid(row.id, host.brand);
  const sequence = nextIcsSequence();
  const results = await Promise.all(
    invitees.map((to) =>
      sendMeetingInvite({
        to,
        host,
        title: row.event_title || "Meeting",
        description: row.notes ?? undefined,
        start: row.start_time,
        end: row.end_time ?? new Date(Date.parse(row.start_time) + 3_600_000).toISOString(),
        joinUrl: video ? row.location : null,
        location: video ? null : row.location,
        uid,
        sequence,
        kind,
        medium,
        attendees: invitees,
      }),
    ),
  );
  const emailedOk = new Set<string>();
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.ok) emailedOk.add(invitees[i].email.toLowerCase());
    else failed.push(`${invitees[i].email} (${r.error})`);
  });

  const warnings: string[] = [];
  const what = kind === "cancel" ? "cancellation" : "update";
  if (failed.length) {
    warnings.push(`The change is saved, but the ${what} email failed for ${failed.join("; ")}. Let them know manually.`);
  }

  if (process.env.MEETING_SMS_ENABLED === "true") {
    // Same people as the original booking: every attendee with a mobile,
    // plus the client (their mobile on file).
    let contactPhone: string | null = null;
    if (row.contact_id) {
      const { data } = await supabase.from("contacts").select("phone").eq("id", row.contact_id).maybeSingle();
      contactPhone = (data as { phone?: string | null } | null)?.phone ?? null;
    }
    const recipients = smsRecipients(
      attendees,
      row.contact_id ? { email: row.contact_email, name: row.contact_name, phone: contactPhone } : null,
    );
    for (const r of recipients) {
      if (await isOptedOut(r.phone)) continue;
      const res = await sendSms({
        contactId: r.isContact ? row.contact_id : null,
        phone: r.phone,
        body: meetingSmsBody({
          firstName: r.name,
          startISO: row.start_time,
          hostName: host.displayName,
          emailed: !!r.email && emailedOk.has(r.email.toLowerCase()),
          medium,
          address: medium === "inspection" ? row.location : null,
          kind,
        }),
        campaign: `meeting-${kind}`,
      });
      if (!res.ok) warnings.push(`The ${what} text to ${r.name || r.phone} failed (${res.error}).`);
    }
  }

  return {
    sent: invitees.length > 0 && failed.length === 0,
    warning: warnings.length ? warnings.join(" ") : null,
  };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const row = await loadRow(id);
  if (!row) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  const v = validateAppointmentPatch(body, { start_time: row.start_time, end_time: row.end_time });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const update: Record<string, unknown> = { ...v.patch, updated_at: new Date().toISOString() };

  // A video meeting's location is the client's signed guest link. A plain edit
  // must never overwrite it, and when the time moves it is re-minted: its expiry
  // was sized to the ORIGINAL time, so pushing the meeting out could kill it.
  if (isGuestLink(row.location)) {
    delete update.location;
    // The link's host follows the meeting owner's brand, as on create.
    const hostChanged = typeof update.host_email === "string" && update.host_email !== row.host_email;
    const brand = hostFor(hostChanged ? (update.host_email as string) : row.host_email).brand;
    if (hostChanged && brand !== hostFor(row.host_email).brand) {
      update.location = rehostJoinLink(row.location!, brand, req.nextUrl.origin);
    }
    if (v.timeChanged && row.contact_id && livekitConfigured()) {
      try {
        const endMs = Date.parse((update.end_time as string | undefined) ?? row.end_time ?? row.start_time);
        const ttlHours = Math.max(24, Math.ceil((endMs - Date.now()) / 3_600_000) + 6);
        const token = await signGuestToken({
          room: roomForContact(row.contact_id),
          name: row.contact_name ?? undefined,
          ttlHours,
        });
        update.location = `${guestJoinOrigin(brand, req.nextUrl.origin, false)}/join/${encodeURIComponent(token)}`;
      } catch (e) {
        log.warn("appointments.patch.remint_failed", { id, message: errMessage(e) });
      }
    }
  }

  if (typeof update.host_email === "string") {
    update.host_name = hostFor(update.host_email).displayName;
  }
  if (v.timeChanged && row.status !== APPOINTMENT_STATUS_CANCELLED) {
    update.status = APPOINTMENT_STATUS_RESCHEDULED;
  }

  const { error } = await supabase.from("appointments").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: `Failed to save: ${errMessage(error)}` }, { status: 500 });
  }

  const fresh = (await loadRow(id)) ?? row;
  const who = await userEmailFromRequest(req);
  log.info("appointments.updated", { id, by: who, fields: Object.keys(v.patch), timeChanged: v.timeChanged });

  // Only email when something the attendee sees changed, and never for a
  // cancelled meeting (an "updated" invite would make it look back on).
  const attendeeVisible =
    v.timeChanged || "event_title" in v.patch || "location" in v.patch || "additional_notes" in v.patch;
  let notify: { sent: boolean; warning: string | null } = { sent: false, warning: null };
  if (body.notify !== false && attendeeVisible && fresh.status !== APPOINTMENT_STATUS_CANCELLED) {
    notify = await notifyAttendee(fresh, "update");
  }

  return NextResponse.json({ appointment: fresh, notify_sent: notify.sent, notify_warning: notify.warning });
}

/**
 * Body: { mode?: "cancel" | "delete", reason?: string, notify?: boolean }
 *   cancel (default) keeps the row as status "cancelled", struck through in the
 *          diary, so the history stays on the client's record.
 *   delete removes the row entirely (mistakes, duplicates, test entries).
 * Either way, the attendee of a still-upcoming, not-already-cancelled meeting is
 * sent a calendar cancellation unless notify is false.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: { mode?: string; reason?: string; notify?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // No body: defaults (cancel, notify).
  }
  const mode = body.mode === "delete" ? "delete" : "cancel";
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  const row = await loadRow(id);
  if (!row) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  const who = await userEmailFromRequest(req);

  const upcoming = Date.parse(row.end_time ?? row.start_time) > Date.now();
  const wantNotify = body.notify !== false && upcoming && row.status !== APPOINTMENT_STATUS_CANCELLED;

  if (mode === "cancel") {
    const { error } = await supabase
      .from("appointments")
      .update({ status: APPOINTMENT_STATUS_CANCELLED, cancel_reason: reason, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: `Failed to cancel: ${errMessage(error)}` }, { status: 500 });
    }
    log.info("appointments.cancelled", { id, by: who, reason });
  } else {
    // Enough to tell what was deleted, nothing more. Never the client's email,
    // the notes, or the location: for a video meeting that is the client's
    // signed join link, a live credential until it expires.
    log.info("appointments.deleted", {
      id,
      by: who,
      reason,
      title: row.event_title,
      start_time: row.start_time,
      end_time: row.end_time,
      status: row.status,
      host_email: row.host_email,
      contact_id: row.contact_id,
    });
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: `Failed to delete: ${errMessage(error)}` }, { status: 500 });
    }
  }

  const notify = wantNotify ? await notifyAttendee(row, "cancel") : { sent: false, warning: null };
  return NextResponse.json({ ok: true, mode, notify_sent: notify.sent, notify_warning: notify.warning });
}
