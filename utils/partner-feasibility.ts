/**
 * Planning feasibility for channel partners (Enterprise: `feature feasibility`).
 * Pure: the allowance, the month boundary and input limits.
 *
 * A report is a long Sonnet run with web search, so each firm has a monthly
 * allowance (PARTNER_FEASIBILITY_MONTHLY, default 10). Only a generated report
 * counts; the interview step is rate-limited instead. The month is the
 * Brisbane calendar month, so "this month" means what the partner thinks it
 * means.
 */

export const DEFAULT_MONTHLY_REPORTS = 10;

export function monthlyAllowance(env: string | undefined = process.env.PARTNER_FEASIBILITY_MONTHLY): number {
  const n = Number(env);
  return Number.isInteger(n) && n >= 0 && n <= 500 ? n : DEFAULT_MONTHLY_REPORTS;
}

/** UTC instant at which the current Brisbane (UTC+10, no DST) month began. */
export function brisbaneMonthStart(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + 10 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 10 * 3600_000);
}

/** Caps on what a partner can send, so one request cannot run up a huge prompt. */
export const MAX_ADDRESS_CHARS = 200;
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_MESSAGES = 12;

export type Msg = { role: "user" | "assistant"; content: string };

/** The transcript the partner sent, trimmed to the caps; null if it is unusable. */
export function boundedTranscript(raw: unknown): Msg[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out: Msg[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    if (content.length > MAX_MESSAGE_CHARS) return null;
    out.push({ role, content });
  }
  return out;
}

export function cleanAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim();
  return s.length >= 8 && s.length <= MAX_ADDRESS_CHARS ? s : null;
}

/** Printed under every partner report. Names no brand (white-label firms hand it out). */
export const PARTNER_FEASIBILITY_DISCLAIMER =
  "Preliminary desktop planning information only, prepared with AI-assisted research from public sources. " +
  "It is not legal, financial or certified town-planning advice. Every figure must be confirmed with the " +
  "Council, a licensed surveyor and a qualified town planner before anyone relies on it.";
