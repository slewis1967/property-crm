/**
 * Revenue / deal-commission tracker — shared types + pure helpers.
 *
 * A deal earns NextKey a `remuneration`, of which `referrer_fee` is paid out;
 * the rest is net. The `payments` array is the instalment schedule (money in),
 * each flagged paid/unpaid so the tracker is live rather than a static sheet.
 * All money maths lives here (pure, unit-testable); the page is a thin UI over it.
 */

export type DealStage = "active" | "settled" | "lost";

export interface DealPayment {
  label: string;            // "1st", "2nd", "Deposit"…
  date: string | null;      // YYYY-MM-DD, or null when unscheduled ("tba")
  amount: number;
  paid: boolean;
}

export interface RevenueDeal {
  id: string;
  lot: string;
  purchaser: string | null;
  remuneration: number;
  referrer_fee: number;
  referrer_note: string | null;
  payments: DealPayment[];
  stage: DealStage;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const DEAL_STAGES: { value: DealStage; label: string; className: string }[] = [
  { value: "active", label: "Active", className: "bg-blue-100 text-blue-700" },
  { value: "settled", label: "Settled", className: "bg-green-100 text-green-700" },
  { value: "lost", label: "Lost", className: "bg-rose-100 text-rose-700" },
];

export const REVENUE_COLUMNS =
  "id,lot,purchaser,remuneration,referrer_fee,referrer_note,payments,stage,notes,created_at,updated_at";

export const REVENUE_MIGRATION_HINT =
  "Revenue tracker storage isn't set up yet — run migrations/20260714_revenue_deals.sql in the Supabase SQL editor.";

// ── Per-deal derived numbers ────────────────────────────────────────────────

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

export const dealNet = (d: RevenueDeal): number => num(d.remuneration) - num(d.referrer_fee);
export const paymentsTotal = (d: RevenueDeal): number => (d.payments ?? []).reduce((s, p) => s + num(p.amount), 0);
export const dealBanked = (d: RevenueDeal): number => (d.payments ?? []).filter((p) => p.paid).reduce((s, p) => s + num(p.amount), 0);
export const dealOutstanding = (d: RevenueDeal): number => (d.payments ?? []).filter((p) => !p.paid).reduce((s, p) => s + num(p.amount), 0);

/** The scheduled payments should add up to the remuneration; flag when they don't. */
export function paymentsReconcile(d: RevenueDeal): boolean {
  return Math.abs(paymentsTotal(d) - num(d.remuneration)) < 1;
}

/** The next unpaid, scheduled payment (earliest date), if any. */
export function nextPayment(d: RevenueDeal): DealPayment | null {
  const upcoming = (d.payments ?? [])
    .filter((p) => !p.paid && p.date)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  return upcoming[0] ?? null;
}

// ── Portfolio-level summary ─────────────────────────────────────────────────

export interface RevenueSummary {
  count: number;
  gross: number;        // sum of remuneration
  referrers: number;    // sum of referrer_fee
  net: number;          // gross − referrers ("Our Total")
  banked: number;       // sum of paid payments
  outstanding: number;  // sum of unpaid, scheduled payments
  unscheduled: number;  // sum of unpaid payments with no date
}

export function summarise(deals: RevenueDeal[], stageFilter?: DealStage): RevenueSummary {
  const rows = stageFilter ? deals.filter((d) => d.stage === stageFilter) : deals.filter((d) => d.stage !== "lost");
  const out: RevenueSummary = { count: rows.length, gross: 0, referrers: 0, net: 0, banked: 0, outstanding: 0, unscheduled: 0 };
  for (const d of rows) {
    out.gross += num(d.remuneration);
    out.referrers += num(d.referrer_fee);
    out.banked += dealBanked(d);
    for (const p of d.payments ?? []) {
      if (p.paid) continue;
      if (p.date) out.outstanding += num(p.amount);
      else out.unscheduled += num(p.amount);
    }
  }
  out.net = out.gross - out.referrers;
  return out;
}

// ── Cashflow by month ───────────────────────────────────────────────────────

export interface MonthBucket {
  month: string;   // "YYYY-MM", or "unscheduled"
  paid: number;    // already banked in that month
  due: number;     // scheduled but unpaid
  total: number;
}

/**
 * Group every payment across active/settled deals by calendar month (gross
 * money-in). "Lost" deals are excluded. Unscheduled (dateless) payments land in
 * a trailing "unscheduled" bucket. Sorted chronologically, unscheduled last.
 */
export function cashflowByMonth(deals: RevenueDeal[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const d of deals) {
    if (d.stage === "lost") continue;
    for (const p of d.payments ?? []) {
      const key = p.date ? p.date.slice(0, 7) : "unscheduled";
      const b = map.get(key) ?? { month: key, paid: 0, due: 0, total: 0 };
      if (p.paid) b.paid += num(p.amount);
      else b.due += num(p.amount);
      b.total += num(p.amount);
      map.set(key, b);
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.month === "unscheduled") return 1;
    if (b.month === "unscheduled") return -1;
    return a.month < b.month ? -1 : 1;
  });
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function fmtMoney(n: number): string {
  const v = Math.round(num(n));
  return "$" + v.toLocaleString("en-AU");
}

export function fmtMonth(key: string): string {
  if (key === "unscheduled") return "Unscheduled";
  const [y, m] = key.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = parseInt(m, 10) - 1;
  return `${names[mi] ?? m} ${y}`;
}

// ── Validation / normalisation for the API ──────────────────────────────────

export const isDealStage = (v: unknown): v is DealStage => v === "active" || v === "settled" || v === "lost";

/** Coerce arbitrary input into a clean DealPayment[]. */
export function normalisePayments(input: unknown): DealPayment[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 24).map((raw, i) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const date = typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null;
    return {
      label: typeof p.label === "string" && p.label.trim() ? p.label.trim().slice(0, 40) : `${i + 1}`,
      date,
      amount: num(p.amount),
      paid: p.paid === true,
    };
  });
}

export function revenueErrMessage(e: unknown, fallback: string): string {
  const o = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  return o?.message || o?.details || o?.hint || o?.code || fallback;
}

/** True only when the `revenue_deals` TABLE is absent (not a column mismatch). */
export function revenueTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}
