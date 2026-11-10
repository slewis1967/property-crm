/**
 * Paid Accounts — the register of paid services the business runs on, and the
 * rules that decide when one "needs attention".
 *
 * Pure and side-effect free on purpose (vitest: utils/paid-services.test.ts).
 * The API routes do the fetching, the sweep does the sending; every judgement
 * about *what counts as needing attention* lives here so the panel, the email
 * digest and the sidebar badge can never disagree with each other.
 *
 * Dates are handled as plain 'YYYY-MM-DD' strings in **Australia/Brisbane**
 * (AEST, no DST — Sean's clock). Never `new Date(dateStr)` then compare to
 * `Date.now()`: a `date` column has no time, and UTC-vs-local drift there is
 * exactly how "due today" silently becomes "overdue yesterday".
 */

export const SERVICE_CATEGORIES = [
  "ai",
  "infrastructure",
  "comms",
  "marketing",
  "domains",
  "software",
  "data",
  "finance",
  "other",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const BILLING_CYCLES = [
  "monthly",
  "quarterly",
  "annual",
  "usage",
  "prepaid",
  "one_off",
] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Cycles that have a predictable next renewal date we can warn about. */
export const RECURRING_CYCLES: readonly BillingCycle[] = ["monthly", "quarterly", "annual"];

export const SERVICE_STATUSES = ["active", "trial", "paused", "cancelled"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const CRITICALITIES = ["critical", "important", "optional"] as const;
export type Criticality = (typeof CRITICALITIES)[number];

/**
 * Accounts whose prepaid balance can be read from the vendor's API.
 *
 * Lives here rather than next to the fetchers in `paid-service-balances.ts`
 * because the panel (a client component) needs the list, and that module imports
 * the server-only Supabase client — pulling it into the browser bundle would ship
 * a module that reads SUPABASE_SERVICE_KEY.
 */
export const BALANCE_SOURCES = ["openrouter", "clicksend"] as const;
export type BalanceSource = (typeof BALANCE_SOURCES)[number];

export type PaidService = {
  id: string;
  name: string;
  category: string;
  purpose: string | null;
  criticality: string;
  status: string;
  vendor_url: string | null;
  account_ref: string | null;
  plan: string | null;
  cost: number | null;
  currency: string;
  billing_cycle: string;
  next_due_date: string | null;
  last_paid_on: string | null;
  auto_renew: boolean;
  payment_method: string | null;
  card_expiry: string | null;
  balance_remaining: number | null;
  balance_unit: string | null;
  low_balance_threshold: number | null;
  /** 'openrouter' | 'clicksend' when the balance is pulled live; null = by hand. */
  balance_source?: string | null;
  balance_checked_at?: string | null;
  balance_check_error?: string | null;
  alert_lead_days: number;
  snoozed_until: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Severity = "critical" | "warning" | "info";

export type AttentionKind =
  | "overdue"
  | "due_soon"
  | "trial_ending"
  | "card_expiring"
  | "low_balance"
  | "stale_balance"
  | "missing_billing_date"
  | "missing_cost";

export type Attention = {
  kind: AttentionKind;
  severity: Severity;
  /** One line, safe to put in an email subject or a badge. */
  headline: string;
  /** The "so what" — what to do or what breaks. */
  detail: string;
  /** Days until the relevant date; negative = past. Null when not date-driven. */
  days: number | null;
};

export type ServiceAttention = {
  service: PaidService;
  items: Attention[];
  /** Worst severity across `items`, or null when nothing needs attention. */
  worst: Severity | null;
  snoozed: boolean;
};

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

/** Only these reach the email digest. `info` items are panel-only nags. */
export const DIGEST_MIN_SEVERITY: Severity = "warning";

// ── date helpers (Brisbane, string-based) ────────────────────────────────────

/** Today in Australia/Brisbane as 'YYYY-MM-DD'. */
export function brisbaneToday(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA gives ISO order (2026-07-25).
  return fmt.format(now);
}

/** Hour of day (0–23) in Australia/Brisbane. */
export function brisbaneHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Brisbane",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  // en-GB gives "07"; midnight can format as "24" in some ICU versions.
  return Number(h) % 24;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function ymdToUtc(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

/**
 * Whole days from `today` to `target` (both 'YYYY-MM-DD'). Positive = future,
 * 0 = today, negative = past. Null if either date is unparseable.
 */
export function daysUntil(target: string | null, today: string): number | null {
  if (!target) return null;
  const a = ymdToUtc(target);
  const b = ymdToUtc(today);
  if (a === null || b === null) return null;
  return Math.round((a - b) / DAY_MS);
}

/** Add whole days to a 'YYYY-MM-DD'. Null if the input is unparseable. */
export function addDays(ymd: string, days: number): string | null {
  const t = ymdToUtc(ymd);
  if (t === null) return null;
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

/** Add whole months to a 'YYYY-MM-DD', clamping the day to the target month. */
export function addMonths(ymd: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const target = new Date(Date.UTC(y, mo + months, 1));
  // Clamp: 31 Jan + 1 month → 28/29 Feb, not 2/3 Mar.
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Months per billing cycle, or null for cycles with no fixed period. */
export function cycleMonths(cycle: string): number | null {
  switch (cycle) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "annual":
      return 12;
    default:
      return null;
  }
}

/**
 * The next renewal date after a payment. Rolls forward from the *scheduled*
 * date (not from today) so a late payment doesn't permanently shift the billing
 * anniversary — but if that lands in the past (a long-missed renewal), keep
 * rolling until it's in the future.
 */
export function advanceDueDate(current: string | null, cycle: string, today: string): string | null {
  const months = cycleMonths(cycle);
  if (!months) return null;
  let next = addMonths(current ?? today, months);
  if (!next) return null;
  let guard = 0;
  while ((daysUntil(next, today) ?? 0) < 0 && guard < 240) {
    const stepped = addMonths(next, months);
    if (!stepped) break;
    next = stepped;
    guard += 1;
  }
  return next;
}

/**
 * Last day of a 'YYYY-MM' card expiry as 'YYYY-MM-DD'. Cards work through the
 * final day of their expiry month, so that — not the 1st — is the cutoff.
 */
export function cardExpiryLastDay(cardExpiry: string | null): string | null {
  if (!cardExpiry) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(cardExpiry.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const last = new Date(Date.UTC(y, mo, 0));
  return last.toISOString().slice(0, 10);
}

// ── the rules ────────────────────────────────────────────────────────────────

/** Warn this far ahead of a card expiring. */
export const CARD_EXPIRY_LEAD_DAYS = 60;

/**
 * How long a live balance reading stays trustworthy. The pull runs with the
 * daily sweep, so anything past two days means it has missed a run.
 */
export const BALANCE_STALE_HOURS = 48;

function plural(n: number, word: string): string {
  return `${n} ${word}${Math.abs(n) === 1 ? "" : "s"}`;
}

function money(service: PaidService): string {
  if (service.cost === null || service.cost === undefined) return "";
  const cur = service.currency || "AUD";
  const amount = service.cost.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${cur} $${amount}`;
}

/**
 * Everything currently wrong (or about to be) with one account.
 *
 * `cancelled` and `paused` accounts are silent — a cancelled service can't have
 * a payment due, and paused is a deliberate choice, not a problem. Snoozed
 * accounts still compute their items (the panel shows them, greyed) but the
 * caller filters them out of the digest via `snoozed`.
 */
export function attentionFor(service: PaidService, today: string, now: Date = new Date()): ServiceAttention {
  const snoozed = (daysUntil(service.snoozed_until, today) ?? -1) >= 0;
  const items: Attention[] = [];

  if (service.status === "cancelled" || service.status === "paused") {
    return { service, items, worst: null, snoozed };
  }

  const leadDays = Number.isFinite(service.alert_lead_days) ? service.alert_lead_days : 7;
  const cost = money(service);
  const manual = service.auto_renew === false;

  // 1. Payment due / overdue.
  const dueDays = daysUntil(service.next_due_date, today);
  if (dueDays !== null) {
    if (dueDays < 0) {
      items.push({
        kind: "overdue",
        severity: "critical",
        headline: `${service.name} — payment overdue by ${plural(-dueDays, "day")}`,
        detail: [
          cost ? `${cost} was due ${service.next_due_date}.` : `Payment was due ${service.next_due_date}.`,
          service.criticality === "critical"
            ? "This one is critical — a failed payment takes the service down."
            : "",
          service.purpose ?? "",
        ]
          .filter(Boolean)
          .join(" "),
        days: dueDays,
      });
    } else if (dueDays <= leadDays) {
      items.push({
        kind: "due_soon",
        // Manual payments need a human, so the last 2 days are urgent; an
        // auto-renewing card only needs to not be dead.
        severity: dueDays <= 2 && manual ? "critical" : "warning",
        headline:
          dueDays === 0
            ? `${service.name} — payment due today`
            : `${service.name} — payment due in ${plural(dueDays, "day")}`,
        detail: [
          cost ? `${cost} due ${service.next_due_date}.` : `Due ${service.next_due_date}.`,
          manual ? "Auto-renew is OFF — this needs to be paid manually." : "Set to auto-renew.",
          service.payment_method ? `Via ${service.payment_method}.` : "No payment method recorded.",
        ]
          .filter(Boolean)
          .join(" "),
        days: dueDays,
      });
    }
  } else if (service.status === "active" && RECURRING_CYCLES.includes(service.billing_cycle as BillingCycle)) {
    // No date = we cannot warn about this account at all. Say so, or the
    // register quietly implies "nothing due" when it means "nothing known".
    items.push({
      kind: "missing_billing_date",
      severity: "info",
      headline: `${service.name} — no renewal date recorded`,
      detail: `Billing cycle is ${service.billing_cycle} but there's no next due date, so no payment warning can fire for this account.`,
      days: null,
    });
  }

  // 2. Trial about to convert or lapse.
  if (service.status === "trial") {
    const trialDays = dueDays;
    if (trialDays !== null && trialDays <= leadDays) {
      items.push({
        kind: "trial_ending",
        severity: trialDays < 0 ? "critical" : "warning",
        headline:
          trialDays < 0
            ? `${service.name} — trial ended ${plural(-trialDays, "day")} ago`
            : `${service.name} — trial ends in ${plural(trialDays, "day")}`,
        detail: `Decide before ${service.next_due_date}: convert to a paid plan or cancel${cost ? ` (${cost} once it converts)` : ""}.`,
        days: trialDays,
      });
    }
  }

  // 3. Card expiring — the classic silent killer: the renewal is fine, the card
  //    isn't. Critical when the card dies *before* the next charge.
  const cardLast = cardExpiryLastDay(service.card_expiry);
  if (cardLast) {
    const cardDays = daysUntil(cardLast, today);
    const diesBeforeRenewal = dueDays !== null && cardDays !== null && cardDays < dueDays;
    if (cardDays !== null && (cardDays < 0 || diesBeforeRenewal)) {
      items.push({
        kind: "card_expiring",
        severity: "critical",
        headline:
          cardDays < 0
            ? `${service.name} — the card on file has expired`
            : `${service.name} — card expires before the next charge`,
        detail: `${service.payment_method ?? "The card on file"} expires ${service.card_expiry}${
          diesBeforeRenewal ? `, before the ${service.next_due_date} renewal` : ""
        }. Update it or the payment will decline.`,
        days: cardDays,
      });
    } else if (cardDays !== null && cardDays <= CARD_EXPIRY_LEAD_DAYS) {
      items.push({
        kind: "card_expiring",
        severity: "warning",
        headline: `${service.name} — card expires in ${plural(cardDays, "day")}`,
        detail: `${service.payment_method ?? "The card on file"} expires ${service.card_expiry}. Update it before the next renewal.`,
        days: cardDays,
      });
    }
  }

  // 4. Prepaid balance running out (OpenRouter, ClickSend, Higgsfield).
  if (service.balance_remaining !== null && service.balance_remaining !== undefined) {
    const threshold = service.low_balance_threshold;
    const unit = service.balance_unit || service.currency || "AUD";
    const shown = `${service.balance_remaining.toLocaleString("en-AU")} ${unit}`;
    if (service.balance_remaining <= 0) {
      items.push({
        kind: "low_balance",
        severity: "critical",
        headline: `${service.name} — prepaid balance is empty`,
        detail: `Balance ${shown}. ${service.purpose ?? "Top up to restore the service."}`,
        days: null,
      });
    } else if (threshold !== null && threshold !== undefined && service.balance_remaining <= threshold) {
      items.push({
        kind: "low_balance",
        severity: "warning",
        headline: `${service.name} — prepaid balance is low`,
        detail: `Balance ${shown}, below the ${threshold.toLocaleString("en-AU")} ${unit} alert threshold. Top up before it runs dry.`,
        days: null,
      });
    }
  }

  // 5. The live balance pull itself. If a prepaid account's balance is supposed
  //    to arrive automatically and isn't, the low-balance alert above can never
  //    fire — so the broken pull has to be the alert. A recorded failure is a
  //    warning (something is actually broken, e.g. a rotated key); merely stale
  //    is info, since one skipped run isn't worth an email.
  if (service.balance_source) {
    const checkedAt = service.balance_checked_at ? new Date(service.balance_checked_at).getTime() : null;
    const ageHours = checkedAt && Number.isFinite(checkedAt) ? (now.getTime() - checkedAt) / 3_600_000 : null;
    if (service.balance_check_error) {
      items.push({
        kind: "stale_balance",
        severity: "warning",
        headline: `${service.name} — automatic balance check is failing`,
        detail: `The ${service.balance_source} balance couldn't be read: ${service.balance_check_error}. Until it's fixed, the low-balance warning can't fire${
          service.balance_remaining !== null && service.balance_remaining !== undefined
            ? ` (last known balance ${service.balance_remaining.toLocaleString("en-AU")} ${service.balance_unit ?? ""})`.trimEnd()
            : ""
        }.`,
        days: null,
      });
    } else if (ageHours === null || ageHours > BALANCE_STALE_HOURS) {
      items.push({
        kind: "stale_balance",
        severity: "info",
        headline:
          ageHours === null
            ? `${service.name} — balance has never been read automatically`
            : `${service.name} — balance reading is ${Math.floor(ageHours / 24)} days old`,
        detail: `The ${service.balance_source} balance pull runs with the daily check. Use "Refresh balances" in the panel to read it now.`,
        days: null,
      });
    }
  }

  // 6. Data quality: an active account with no cost can't be budgeted.
  if (service.status === "active" && (service.cost === null || service.cost === undefined) && service.billing_cycle !== "usage") {
    items.push({
      kind: "missing_cost",
      severity: "info",
      headline: `${service.name} — no cost recorded`,
      detail: "Add the amount so it counts toward the monthly spend total.",
      days: null,
    });
  }

  const worst = items.reduce<Severity | null>((acc, i) => {
    if (!acc) return i.severity;
    return SEVERITY_RANK[i.severity] > SEVERITY_RANK[acc] ? i.severity : acc;
  }, null);

  return { service, items, worst, snoozed };
}

// ── spend ────────────────────────────────────────────────────────────────────

/**
 * Cost normalised to a monthly figure, or null when there's nothing to
 * annualise (usage-based, prepaid top-ups, one-offs, or no cost recorded).
 * Cancelled/paused accounts contribute nothing.
 *
 * No FX conversion: a USD row is NOT silently added to an AUD total — see
 * `summarise`, which totals per currency.
 */
export function monthlyEquivalent(service: PaidService): number | null {
  if (service.status === "cancelled" || service.status === "paused") return null;
  if (service.cost === null || service.cost === undefined) return null;
  const months = cycleMonths(service.billing_cycle);
  if (!months) return null;
  return service.cost / months;
}

export type Summary = {
  total: number;
  active: number;
  needingAttention: number;
  criticalCount: number;
  warningCount: number;
  /** Monthly + annual recurring spend per currency (no FX guessing). */
  spendByCurrency: { currency: string; monthly: number; annual: number }[];
  /** Active accounts whose cost/cycle can't be annualised (usage, prepaid, unknown). */
  unbudgeted: number;
  byCategory: { category: string; count: number }[];
};

/** Attention for every service, worst first, then by soonest date. */
export function assessAll(services: PaidService[], today: string, now: Date = new Date()): ServiceAttention[] {
  const assessed = services.map((s) => attentionFor(s, today, now));
  return assessed.sort((a, b) => {
    const ra = a.worst && !a.snoozed ? SEVERITY_RANK[a.worst] : -1;
    const rb = b.worst && !b.snoozed ? SEVERITY_RANK[b.worst] : -1;
    if (ra !== rb) return rb - ra;
    const da = a.items.reduce<number | null>((m, i) => (i.days === null ? m : m === null ? i.days : Math.min(m, i.days)), null);
    const db = b.items.reduce<number | null>((m, i) => (i.days === null ? m : m === null ? i.days : Math.min(m, i.days)), null);
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    }
    return a.service.name.localeCompare(b.service.name);
  });
}

/** Only the accounts that need a human: not snoozed, at least `min` severity. */
export function actionable(assessed: ServiceAttention[], min: Severity = DIGEST_MIN_SEVERITY): ServiceAttention[] {
  return assessed
    .filter((a) => !a.snoozed)
    .map((a) => ({ ...a, items: a.items.filter((i) => SEVERITY_RANK[i.severity] >= SEVERITY_RANK[min]) }))
    .filter((a) => a.items.length > 0);
}

export function summarise(services: PaidService[], today: string, now: Date = new Date()): Summary {
  const assessed = assessAll(services, today, now);
  const live = actionable(assessed, "warning");

  const byCur = new Map<string, number>();
  let unbudgeted = 0;
  for (const s of services) {
    if (s.status === "cancelled" || s.status === "paused") continue;
    const m = monthlyEquivalent(s);
    if (m === null) {
      unbudgeted += 1;
      continue;
    }
    const cur = s.currency || "AUD";
    byCur.set(cur, (byCur.get(cur) ?? 0) + m);
  }

  const cats = new Map<string, number>();
  for (const s of services) cats.set(s.category, (cats.get(s.category) ?? 0) + 1);

  return {
    total: services.length,
    active: services.filter((s) => s.status === "active" || s.status === "trial").length,
    needingAttention: live.length,
    criticalCount: live.filter((a) => a.worst === "critical").length,
    warningCount: live.filter((a) => a.worst === "warning").length,
    spendByCurrency: [...byCur.entries()]
      .map(([currency, monthly]) => ({
        currency,
        monthly: Math.round(monthly * 100) / 100,
        annual: Math.round(monthly * 12 * 100) / 100,
      }))
      .sort((a, b) => b.monthly - a.monthly),
    unbudgeted,
    byCategory: [...cats.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
  };
}

// ── shared error helpers (same shape as utils/deals.ts) ──────────────────────

export function paidErrMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  const o = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  return o?.message || o?.details || o?.hint || o?.code || fallback;
}

/**
 * True when the failure is "table not created yet".
 *
 * Deliberately narrow — matches relation-level errors only, NOT the loose
 * "schema cache"/"does not exist" substring test, which also catches *column*
 * errors (PGRST204 / 42703) and would tell the operator to re-run a migration
 * they've already run. Same reasoning as `factFindsTableMissing`.
 */
export function paidServicesTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = (e?.message ?? "").toLowerCase();
  return (
    e?.code === "42P01" ||
    e?.code === "PGRST205" ||
    msg.includes("could not find the table") ||
    msg.includes("relation \"public.paid_services\" does not exist") ||
    msg.includes("relation \"public.paid_service_alerts\" does not exist")
  );
}
