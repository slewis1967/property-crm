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
