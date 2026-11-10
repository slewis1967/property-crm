import { randomUUID } from "crypto";

/**
 * Helpers for the `appointments` table — the single source of truth for its
 * real (legacy Cal.com) shape, so every writer/reader agrees on column names.
 *
 * The table is NOT the `title`/`appointment_status`/`notes` shape an earlier
 * version of the scheduler assumed (those columns don't exist — inserts using
 * them silently failed, which is why the table sat empty). Its real columns are
 * `event_title`, `status`, `additional_notes`, and a NOT-NULL unique `cal_uid`.
 * `status` has a CHECK constraint — only a fixed vocabulary is allowed; a new
 * booking is 'booked' (NOT 'scheduled'/'accepted', which the constraint rejects).
 * `id`, `created_at`, `updated_at` have DB defaults and must be omitted.
 */

export const APPOINTMENT_STATUS_BOOKED = "booked";
export const APPOINTMENT_STATUS_CANCELLED = "cancelled";

/**
 * Columns to select for calendar/list reads. Uses the real column names and
 * aliases `additional_notes` → `notes` so client readers keep a stable `notes`
 * field. `event_title` and `status` are already the client's primary keys.
 */
export const APPOINTMENT_READ_COLUMNS =
  "id,cal_uid,event_title,start_time,end_time,status,location," +
  "notes:additional_notes,host_name,host_email,contact_id,contact_email,contact_name";

export interface AppointmentInsertInput {
  contactId: string | null;
  contactEmail: string;
  contactName?: string | null;
  hostEmail: string;
  hostName: string;
  title: string;
  startISO: string;
  endISO: string;
  /** LiveKit join URL or a physical location. */
  location?: string | null;
  notes?: string | null;
}

/**
 * Build an insert row matching the real `appointments` schema. `cal_uid` is
 * generated (NOT NULL + unique on this table); `id`/`created_at`/`updated_at`
 * are left to their DB defaults.
 */
export function buildAppointmentRow(i: AppointmentInsertInput): Record<string, unknown> {
  return {
    cal_uid: `crm-${randomUUID()}`,
    contact_id: i.contactId,
    contact_email: i.contactEmail,
    contact_name: i.contactName ?? null,
    host_email: i.hostEmail,
    host_name: i.hostName,
    event_title: i.title,
    start_time: i.startISO,
    end_time: i.endISO,
    location: i.location ?? null,
    additional_notes: i.notes ?? null,
    status: APPOINTMENT_STATUS_BOOKED,
  };
}

export const APPOINTMENT_STATUS_RESCHEDULED = "rescheduled";

/**
 * The .ics UID an appointment's invites were sent under. Both writers use
 * `appt-<id>@<brand domain>` (the self-book route picks the Springboard domain
 * for Springboard hosts), so update/cancel emails must rebuild the same string
 * or the attendee's calendar adds a second entry instead of moving the first.
 */
export function appointmentIcsUid(id: string, brand: "nextkey" | "springboard"): string {
  return `appt-${id}@${brand === "springboard" ? "springboardhomes.com.au" : "nextkey.com.au"}`;
}

/**
 * A rising .ics SEQUENCE for an update/cancel. Calendar clients ignore an
 * update whose SEQUENCE isn't higher than the last one they saw; we don't store
 * a counter, so seconds-since-epoch is used — always higher than the 0 the
 * original invite carried, and higher than any earlier update.
 */
export function nextIcsSequence(now: number = Date.now()): number {
  return Math.floor(now / 1000);
}

export interface AppointmentPatchInput {
  title?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  notes?: unknown;
  location?: unknown;
  host_email?: unknown;
}

export type AppointmentPatch = {
  event_title?: string;
  start_time?: string;
  end_time?: string;
  additional_notes?: string | null;
  location?: string | null;
  host_email?: string;
};

/**
 * Validate an edit to an existing appointment. Only the fields present are
 * changed. `current` supplies the existing start/end so a move of just one end
 * is still checked for end > start. Pure — unit-tested.
 */
export function validateAppointmentPatch(
  body: AppointmentPatchInput,
  current: { start_time: string; end_time: string | null },
): { ok: true; patch: AppointmentPatch; timeChanged: boolean } | { ok: false; error: string } {
  const patch: AppointmentPatch = {};

  if (body.title !== undefined) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (!t) return { ok: false, error: "Title can't be blank." };
    patch.event_title = t;
  }

  let startMs = Date.parse(current.start_time);
  let endMs = current.end_time ? Date.parse(current.end_time) : startMs + 60 * 60_000;
  if (body.start_time !== undefined) {
    const ms = typeof body.start_time === "string" ? Date.parse(body.start_time) : NaN;
    if (!Number.isFinite(ms)) return { ok: false, error: "Start time isn't a valid date/time." };
    startMs = ms;
  }
  if (body.end_time !== undefined) {
    const ms = typeof body.end_time === "string" ? Date.parse(body.end_time) : NaN;
    if (!Number.isFinite(ms)) return { ok: false, error: "End time isn't a valid date/time." };
    endMs = ms;
  }
  if (!(endMs > startMs)) return { ok: false, error: "End time must be after the start time." };

  const newStart = new Date(startMs).toISOString();
  const newEnd = new Date(endMs).toISOString();
  const oldStart = new Date(Date.parse(current.start_time)).toISOString();
  const oldEnd = current.end_time ? new Date(Date.parse(current.end_time)).toISOString() : null;
  const timeChanged = newStart !== oldStart || newEnd !== oldEnd;
  if (body.start_time !== undefined || body.end_time !== undefined) {
    patch.start_time = newStart;
    patch.end_time = newEnd;
  }

  if (body.notes !== undefined) {
    patch.additional_notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }
  if (body.location !== undefined) {
    patch.location = typeof body.location === "string" && body.location.trim() ? body.location.trim() : null;
  }
  if (body.host_email !== undefined) {
    const h = typeof body.host_email === "string" ? body.host_email.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h)) return { ok: false, error: "Host must be a valid email." };
    patch.host_email = h;
  }

  return { ok: true, patch, timeChanged };
}
