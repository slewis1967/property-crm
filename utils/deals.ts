/**
 * Shared helpers + constants for the Development Watchlist (dev_opportunities).
 */

/** Pipeline stages for a development/site opportunity, in order. */
export const DEAL_STAGES = [
  "Identified",
  "Researching",
  "Feasibility done",
  "Owner contact",
  "Pursuing",
  "Won",
  "Passed",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

/** Human message from an Error or a Supabase PostgrestError (plain object). */
export function dealErrMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  const o = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  return o?.message || o?.details || o?.hint || o?.code || fallback;
}

/** True when the failure is just "table not created yet" (migration not run). */
export function dealsTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = (e?.message ?? "").toLowerCase();
  return (
    e?.code === "42P01" ||
    e?.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table")
  );
}
