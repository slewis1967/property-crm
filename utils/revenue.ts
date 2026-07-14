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

// ── Forecast (net cash by month) ────────────────────────────────────────────

export interface ForecastMonth {
  month: string;         // "YYYY-MM" or "unscheduled"
  gross: number;         // cash in that month
  referral: number;      // referral cost apportioned to that month
  net: number;           // gross − referral
  paid: number;          // net already banked in that month
  cumulativeNet: number; // running net total
}

/**
 * Net cashflow by month for the forecast document. Referral cost is apportioned
 * across a deal's instalments in proportion to amount, using the ratio that
 * makes each deal's scheduled net sum exactly to its net fee — so the monthly
 * totals reconcile to the net pipeline even where instalments don't equal the
 * remuneration. Deals with no scheduled payments contribute their whole net to
 * an "unscheduled" bucket (shown last). "Lost" deals are excluded.
 */
export function forecastByMonth(deals: RevenueDeal[]): ForecastMonth[] {
  type Acc = Omit<ForecastMonth, "cumulativeNet">;
  const map = new Map<string, Acc>();
  const bump = (key: string, gross: number, referral: number, net: number, paid: number) => {
    const b = map.get(key) ?? { month: key, gross: 0, referral: 0, net: 0, paid: 0 };
    b.gross += gross; b.referral += referral; b.net += net; b.paid += paid;
    map.set(key, b);
  };
  for (const d of deals) {
    if (d.stage === "lost") continue;
    const total = paymentsTotal(d);
    const net = dealNet(d);
    if (total > 0) {
      const netRate = net / total; // payment nets then sum to dealNet
      for (const p of d.payments ?? []) {
        const key = p.date ? p.date.slice(0, 7) : "unscheduled";
        const g = num(p.amount);
        const n = g * netRate;
        bump(key, g, g - n, n, p.paid ? n : 0);
      }
    } else {
      bump("unscheduled", num(d.remuneration), num(d.referrer_fee), net, 0);
    }
  }
  const rows = [...map.values()].sort((a, b) => {
    if (a.month === "unscheduled") return 1;
    if (b.month === "unscheduled") return -1;
    return a.month < b.month ? -1 : 1;
  });
  let cum = 0;
  return rows.map((r) => { cum += r.net; return { ...r, cumulativeNet: cum }; });
}

// ── Operating costs + net-profit forecast ──────────────────────────────────

export interface OperatingCost {
  id: string;
  label: string;
  monthly_amount: number;
  created_at: string;
  updated_at: string;
}

export const REVENUE_COST_COLUMNS = "id,label,monthly_amount,created_at,updated_at";

export const costsMonthlyTotal = (costs: OperatingCost[]): number =>
  costs.reduce((s, c) => s + num(c.monthly_amount), 0);

const monthIndex = (key: string): number => {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
};
const indexToKey = (idx: number): string => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;

/** Inclusive list of "YYYY-MM" from start to end (capped at 120 months). */
export function monthsBetween(start: string, end: string): string[] {
  const a = monthIndex(start), b = monthIndex(end);
  if (b < a) return [start];
  const out: string[] = [];
  for (let i = a; i <= b && out.length < 120; i++) out.push(indexToKey(i));
  return out;
}

export interface ProfitMonth {
  month: string;
  revenue: number;          // net revenue landing that month
  cost: number;             // operating cost that month
  profit: number;           // revenue − cost
  cumulativeProfit: number;
  paidRevenue: number;      // net revenue already banked that month
}

export interface ProfitForecast {
  months: ProfitMonth[];
  totalRevenue: number;     // = net pipeline
  totalCost: number;        // monthlyCost × months in the scheduled window
  netProfit: number;
  monthlyCost: number;
  monthsCount: number;
}

/**
 * Net-profit forecast: lays deal net-revenue onto a continuous monthly timeline
 * (first → last scheduled instalment) and subtracts a flat monthly operating
 * cost from every month in that window. Unscheduled (dateless) revenue is added
 * as a trailing bucket carrying no operating cost.
 */
export function profitForecast(deals: RevenueDeal[], monthlyCost: number): ProfitForecast {
  const rev = forecastByMonth(deals);
  const dated = rev.filter((r) => r.month !== "unscheduled");
  const revMap = new Map(dated.map((r) => [r.month, r]));
  const unscheduled = rev.find((r) => r.month === "unscheduled");
  const timeline = dated.length ? monthsBetween(dated[0].month, dated[dated.length - 1].month) : [];

  let cum = 0;
  const months: ProfitMonth[] = timeline.map((m) => {
    const r = revMap.get(m);
    const revenue = r?.net ?? 0;
    const profit = revenue - monthlyCost;
    cum += profit;
    return { month: m, revenue, cost: monthlyCost, profit, cumulativeProfit: cum, paidRevenue: r?.paid ?? 0 };
  });
  if (unscheduled && unscheduled.net) {
    cum += unscheduled.net;
    months.push({ month: "unscheduled", revenue: unscheduled.net, cost: 0, profit: unscheduled.net, cumulativeProfit: cum, paidRevenue: 0 });
  }

  const totalRevenue = rev.reduce((s, r) => s + r.net, 0);
  const totalCost = monthlyCost * timeline.length;
  return { months, totalRevenue, totalCost, netProfit: totalRevenue - totalCost, monthlyCost, monthsCount: timeline.length };
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
