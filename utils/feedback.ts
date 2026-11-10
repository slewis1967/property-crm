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

/**
 * The autonomous-agent pipeline stage, driven by the cloud routine:
 *   pending → triaged → working → (shipped | built | awaiting_signoff | skipped | error)
 * A held item (feature plan, or a risk-class fix) sits at `awaiting_signoff`
 * until a human approves/rejects; on approval it goes back through `working`.
 */
export type FeedbackAgentStage =
  | "pending"
  | "triaged"
  | "working"
  | "awaiting_signoff"
  | "built"
  | "shipped"
  | "done"
  | "skipped"
  | "error";

export type FeedbackSignoff = "approved" | "rejected";

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

/**
 * The autonomous-agent pipeline stages, with UI labels + badge styling.
 * Kept in one place so the feedback page and any status view stay in sync.
 */
export const AGENT_STAGES: Record<
  FeedbackAgentStage,
  { label: string; className: string; hint: string }
> = {
  pending:          { label: "Queued",            className: "bg-gray-100 text-gray-600",   hint: "Waiting for the agent to triage it." },
  triaged:          { label: "Triaged",           className: "bg-blue-100 text-blue-700",   hint: "Classified — queued for the agent to act on." },
  working:          { label: "Agent working",     className: "bg-amber-100 text-amber-700", hint: "The agent is investigating / building right now." },
  awaiting_signoff: { label: "Needs your sign-off", className: "bg-purple-100 text-purple-700", hint: "A plan (or a sensitive fix) is ready for you to approve or reject." },
  built:            { label: "Built — review PR", className: "bg-teal-100 text-teal-700",   hint: "The change is built and a PR is open for you to merge." },
  shipped:          { label: "Fixed & shipped",   className: "bg-green-100 text-green-700", hint: "The fix passed CI and is live in production." },
  done:             { label: "Done",              className: "bg-green-100 text-green-700", hint: "Completed." },
  skipped:          { label: "Skipped",           className: "bg-rose-100 text-rose-700",   hint: "The agent judged it not genuine / not needed — see its note." },
  error:            { label: "Agent error",       className: "bg-rose-100 text-rose-700",   hint: "The agent hit a problem — see its note." },
};

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
  // AI triage + autonomous-agent fields (all nullable; absent before migration).
  ai_kind?: FeedbackType | null;
  ai_genuine?: boolean | null;
  ai_severity?: FeedbackPriority | null;
  ai_risk_class?: boolean | null;
  ai_summary?: string | null;
  ai_analysis?: string | null;
  ai_confidence?: number | null;
  agent_stage?: FeedbackAgentStage | null;
  pr_url?: string | null;
  plan?: string | null;
  signoff?: FeedbackSignoff | null;
  signoff_by?: string | null;
  signoff_at?: string | null;
  agent_error?: string | null;
  triaged_at?: string | null;
  processed_at?: string | null;
}

export const FEEDBACK_MIGRATION_HINT =
  "Feedback storage isn't set up yet — run migrations/20260714_feedback.sql in the Supabase SQL editor.";

/**
 * Base columns — always present once the first feedback migration is applied.
 * Selected as a fallback when the AI-pipeline columns aren't migrated yet.
 */
export const FEEDBACK_COLUMNS_BASE =
  "id,type,title,details,area,priority,status,submitted_by,page_url,created_at,updated_at";

/** Full column list including the AI-triage / agent-pipeline fields. */
export const FEEDBACK_COLUMNS =
  FEEDBACK_COLUMNS_BASE + "," +
  "ai_kind,ai_genuine,ai_severity,ai_risk_class,ai_summary,ai_analysis,ai_confidence," +
  "agent_stage,pr_url,plan,signoff,signoff_by,signoff_at,agent_error,triaged_at,processed_at";

/**
 * True when the error is a missing *column* — i.e. the AI-pipeline migration
 * (20260714_feedback_ai.sql) hasn't been run yet. Lets the routes fall back to
 * the base columns so the feature keeps working before the migration is applied.
 */
export function feedbackAiColumnsMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  return typeof e.message === "string" && /column .*does not exist/i.test(e.message);
}

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
