/**
 * Feedback / issue tracker — shared types + helpers.
 *
 * Lets any user file a bug, an identified issue, or a feature request straight
 * from the CRM. Deliberately tiny: one Supabase table (`feedback`), a create +
 * list + status-patch API, and a page. Degrades gracefully when the table
 * hasn't been migrated yet (list returns empty; create returns a run-the-
 * migration hint) so the code is safe to deploy ahead of the SQL.
 */

export type FeedbackType = "bug" | "feature" | "other";
export type FeedbackPriority = "low" | "medium" | "high";
export type FeedbackStatus =
  | "open"
  | "planned"
  | "in_progress"
  | "done"
  | "wont_do";

export const FEEDBACK_TYPES: { value: FeedbackType; label: string; emoji: string; hint: string }[] = [
  { value: "bug", label: "Something's broken", emoji: "🐞", hint: "A bug or error — something isn't working the way it should." },
  { value: "feature", label: "Idea / request", emoji: "💡", hint: "A new feature or an improvement you'd like to see." },
  { value: "other", label: "Other", emoji: "💬", hint: "A question, a bit of confusion, or anything else." },
];

export const FEEDBACK_PRIORITIES: { value: FeedbackPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High — blocking me" },
];

export const FEEDBACK_STATUSES: { value: FeedbackStatus; label: string; className: string }[] = [
  { value: "open", label: "Open", className: "bg-gray-100 text-gray-700" },
  { value: "planned", label: "Planned", className: "bg-blue-100 text-blue-700" },
  { value: "in_progress", label: "In progress", className: "bg-amber-100 text-amber-700" },
  { value: "done", label: "Done", className: "bg-green-100 text-green-700" },
  { value: "wont_do", label: "Won't do", className: "bg-rose-100 text-rose-700" },
];

/** One feedback record as stored + listed. */
export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  title: string;
  details: string | null;
  area: string | null;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  submitted_by: string | null;
  page_url: string | null;
  created_at: string;
  updated_at: string;
}

export const FEEDBACK_MIGRATION_HINT =
  "Feedback storage isn't set up yet — run migrations/20260714_feedback.sql in the Supabase SQL editor.";

/** Explicit column list for the list view (avoid `select("*")`). */
export const FEEDBACK_COLUMNS =
  "id,type,title,details,area,priority,status,submitted_by,page_url,created_at,updated_at";

export function isFeedbackType(v: unknown): v is FeedbackType {
  return v === "bug" || v === "feature" || v === "other";
}
export function isFeedbackPriority(v: unknown): v is FeedbackPriority {
  return v === "low" || v === "medium" || v === "high";
}
export function isFeedbackStatus(v: unknown): v is FeedbackStatus {
  return ["open", "planned", "in_progress", "done", "wont_do"].includes(v as string);
}

export function feedbackErrMessage(e: unknown, fallback: string): string {
  const o = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  return o?.message || o?.details || o?.hint || o?.code || fallback;
}

/**
 * True only when the `feedback` TABLE is absent — never for a column-level
 * mismatch (which would wrongly tell the operator to re-run a migration they
 * already ran). Mirrors `factFindsTableMissing`.
 */
export function feedbackTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}
