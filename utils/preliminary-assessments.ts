/**
 * Preliminary Assessment (PA) — pure types + constants.
 *
 * The PA is the credit proposal Your Loan Assist sends back after assessing an
 * application. A rep presents it to the applicants on a video call, they watch
 * YLA's program video, and it is then sent to them for electronic signature.
 * Table: migrations/20261006_preliminary_assessments.sql.
 *
 * NO server imports here (no supabase, no node:*), so client components can pull
 * in the types and the room-message shapes.
 */

export const PRELIMINARY_ASSESSMENTS_TABLE = "preliminary_assessments";
export const PA_BUCKET = "preliminary-assessments";

export const PA_STATUSES = [
  "Received",
  "Presented",
  "Sent for signing",
  "Signed",
  "Superseded",
] as const;
export type PaStatus = (typeof PA_STATUSES)[number];

/** The status at which the PA is fully signed and read-only (sign engine lock). */
export const PA_TERMINAL_STATUS: PaStatus = "Signed";

export type PaApplicant = { name: string; email: string };

/**
 * Where one applicant's printed signature rule sits on YLA's PDF. PDF points,
 * bottom-left origin (the pdf-lib convention); `page` is 0-based. (x, y) is the
 * left end of the rule; the signature image is drawn sitting on it.
 */
export type PaSignatureLine = {
  name: string;
  page: number;
  x: number;
  y: number;
  width: number;
};

/** The `data` blob the mailbox feeder writes. Every field may be absent. */
export type PaData = {
  applicants: PaApplicant[];
  signature_lines: PaSignatureLine[];
  page_count: number | null;
  property: string;
  email_from: string;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Normalise a stored `data` blob; never throws on a malformed row. */
export function hydratePa(blob: unknown): PaData {
  const b = (blob && typeof blob === "object" ? blob : {}) as Record<string, unknown>;
  const applicants = (Array.isArray(b.applicants) ? b.applicants : [])
    .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>) : {}))
    .map((a) => ({ name: str(a.name), email: str(a.email).toLowerCase() }))
    .filter((a) => a.name || a.email);
  const signature_lines = (Array.isArray(b.signature_lines) ? b.signature_lines : [])
    .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
    .map((l) => ({
      name: str(l.name),
      page: num(l.page) ?? -1,
      x: num(l.x) ?? -1,
      y: num(l.y) ?? -1,
      width: num(l.width) ?? 0,
    }))
    .filter((l) => l.page >= 0 && l.x >= 0 && l.y >= 0 && l.width > 0);
  return {
    applicants,
    signature_lines,
    page_count: num(b.page_count),
    property: str(b.property),
    email_from: str(b.email_from),
  };
}

/** "Marcia LIBMAN & Mark Benjamin LIBMAN" — for labels, emails and filenames. */
export function paSummary(data: PaData): string {
  return data.applicants
    .map((a) => a.name)
    .filter(Boolean)
    .join(" & ");
}

/** A PA row as the staff UI and the call screen see it (no storage path). */
export type PaListRow = {
  id: string;
  yla_ref: string;
  received_at: string;
  pdf_filename: string | null;
  video_url: string | null;
  status: PaStatus;
  contact_id: string | null;
  document_request_id: string | null;
  matched_by: string | null;
  presented_at: string | null;
  video_shown_at: string | null;
  video_confirmed_at: string | null;
  signing_sent_at: string | null;
  signing_error: string | null;
  applicants: PaApplicant[];
  property: string;
};

/** Columns to select for a PaListRow (+ `data`, which is reduced before returning). */
export const PA_LIST_COLUMNS =
  "id,yla_ref,received_at,pdf_filename,video_url,status,contact_id,document_request_id," +
  "matched_by,presented_at,video_shown_at,video_confirmed_at,signing_sent_at,signing_error,data";

export function toPaListRow(row: Record<string, unknown>): PaListRow {
  const data = hydratePa(row.data);
  const s = (k: string): string | null => (typeof row[k] === "string" ? (row[k] as string) : null);
  return {
    id: String(row.id ?? ""),
    yla_ref: String(row.yla_ref ?? ""),
    received_at: String(row.received_at ?? ""),
    pdf_filename: s("pdf_filename"),
    video_url: s("video_url"),
    status: (PA_STATUSES as readonly string[]).includes(String(row.status))
      ? (row.status as PaStatus)
      : "Received",
    contact_id: s("contact_id"),
    document_request_id: s("document_request_id"),
    matched_by: s("matched_by"),
    presented_at: s("presented_at"),
    video_shown_at: s("video_shown_at"),
    video_confirmed_at: s("video_confirmed_at"),
    signing_sent_at: s("signing_sent_at"),
    signing_error: s("signing_error"),
    applicants: data.applicants,
    property: data.property,
  };
}

/** A PA that can still be presented / sent (not signed off, not replaced). */
export function isLivePa(status: string): boolean {
  return status === "Received" || status === "Presented" || status === "Sent for signing";
}

/**
 * YLA's video page only ever lives on these hosts. The link is scraped from an
 * email and then shown to applicants as a button, so it is checked before it is
 * stored AND before it is rendered — never open a host that isn't on this list.
 */
const YLA_VIDEO_HOSTS = ["broker.yourloanassist.co", "broker.yourloanassist.com.au"];

/** Return a safe https URL for YLA's video page, or null if it isn't one. */
export function safeYlaVideoUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return null;
  }
  if (!YLA_VIDEO_HOSTS.includes(url.hostname.toLowerCase())) return null;
  url.protocol = "https:";
  return url.toString();
}

/* ── In-call presentation messages ─────────────────────────────────────────
 *
 * Sent over the LiveKit data channel on PA_TOPIC by the presenting rep and
 * re-sent every couple of seconds while a step is live, so an applicant who
 * joins late (or drops and reconnects) lands on the right screen without the
 * rep doing anything. Guests never send on this topic; a message from a
 * participant who cannot publish data as staff is ignored by the receiver.
 */
export const PA_TOPIC = "pa-presentation";

export type PaRoomMessage =
  | { type: "pa"; paId: string; page: number; pageCount: number }
  | { type: "video"; paId: string }
  | { type: "idle" };

export function parsePaRoomMessage(raw: unknown): PaRoomMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (m.type === "idle") return { type: "idle" };
  const paId = typeof m.paId === "string" ? m.paId : "";
  if (!/^[0-9a-f-]{36}$/i.test(paId)) return null;
  if (m.type === "video") return { type: "video", paId };
  if (m.type === "pa") {
    const page = typeof m.page === "number" && m.page >= 1 ? Math.floor(m.page) : 1;
    const pageCount =
      typeof m.pageCount === "number" && m.pageCount >= 1 ? Math.floor(m.pageCount) : 1;
    return { type: "pa", paId, page: Math.min(page, pageCount), pageCount };
  }
  return null;
}
