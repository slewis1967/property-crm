/**
 * "When do I get paid?" for referral partners. Pure, so it is pinned by
 * partner-pay.test.ts.
 *
 * NO NEW TERMS LIVE HERE. Every sentence restates a signed agreement:
 *   - Channel partners (/partner, NextKey): utils/partner-agreement-text.ts
 *     clause 5.3 (the portal figure is indicative), 5.4 (100% within 14 days
 *     after NextKey receives the Gross Developer Fee, against a valid tax
 *     invoice) and 5.5 (nothing if it does not settle).
 *   - Introducers (/introducer, Springboard): utils/pdf/introducerAgreementPdf.ts
 *     "When it is payable" (earned at settlement, payable once Springboard has
 *     the funds in cleared funds, paid within 14 days of the introducer's
 *     invoice). That wording is Springboard-facing and is NOT switched on: see
 *     INTRODUCER_PAY_WORDING_APPROVAL below.
 *
 * Expected pay date (once both the fee and the tax invoice are in):
 *   - invoice on or before fee + 14 days  -> fee + 14 days (clause 5.4's own
 *     deadline: 14 days after NextKey receives the fee);
 *   - invoice later than that             -> invoice + 14 days.
 * This is exactly what the compliance-reviewed "awaiting_invoice" line tells
 * the partner, so the date shown later never contradicts what they were told.
 * (Sean's note said "invoice + 14"; that would show a LATER date than clause
 * 5.4 allows whenever the invoice arrives inside the window, so it is not used.)
 *
 * Dates are calendar days ("YYYY-MM-DD"), as staff enter them. No amount here
 * is ever the gross fee or NextKey's share: the only amounts are the partner's
 * own indicative fee (already on the deal) and what was actually paid to them.
 */

import { columnMissing, type PgLikeError } from "./column-missing";

export const PAY_WITHIN_DAYS = 14;

/** The staff-entered payment record for one deal or referral. */
export type PayRecord = {
  fundsReceivedOn: string | null;
  invoiceReceivedOn: string | null;
  paidOn: string | null;
  paidAmount: number | null;
};

export const EMPTY_PAY_RECORD: PayRecord = {
  fundsReceivedOn: null,
  invoiceReceivedOn: null,
  paidOn: null,
  paidAmount: null,
};

export type PayStatus =
  | "before_settlement"
  | "not_payable"
  | "awaiting_funds"
  | "awaiting_invoice"
  | "invoiced"
  | "paid";

export const PAY_STATUS_LABELS: Record<PayStatus, string> = {
  before_settlement: "Payable after settlement",
  not_payable: "No fee payable",
  awaiting_funds: "Awaiting developer's fee",
  awaiting_invoice: "Send your tax invoice",
  invoiced: "Invoiced",
  paid: "Paid",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in "YYYY-MM-DD" form, or false. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in Brisbane, "YYYY-MM-DD". */
export function brisbaneToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "18 Nov 2026" for a "YYYY-MM-DD" calendar date (no timezone shift). */
export function formatPayDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-AU", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** See the header: fee + 14, or invoice + 14 when the invoice came after that. */
export function expectedPayDate(rec: PayRecord): string | null {
  if (!rec.fundsReceivedOn || !rec.invoiceReceivedOn) return null;
  const feeDeadline = addDays(rec.fundsReceivedOn, PAY_WITHIN_DAYS);
  return rec.invoiceReceivedOn <= feeDeadline ? feeDeadline : addDays(rec.invoiceReceivedOn, PAY_WITHIN_DAYS);
}

export type StageKind = "open" | "settled" | "closed";

/**
 * Where the payment stands. A paid date always wins (staff recorded it), then
 * the deal's own stage: nothing is payable until settlement, and nothing at all
 * on a deal that closed without settling.
 */
export function payStatus(stage: StageKind, rec: PayRecord): PayStatus {
  if (rec.paidOn) return "paid";
  if (stage === "closed") return "not_payable";
  if (stage === "open") return "before_settlement";
  if (!rec.fundsReceivedOn) return "awaiting_funds";
  if (!rec.invoiceReceivedOn) return "awaiting_invoice";
  return "invoiced";
}

export type PayLine = {
  status: PayStatus;
  label: string;
  line: string;
  expectedOn: string | null;
};

/** Channel-partner wording (NextKey brand). Restates clauses 5.3 to 5.5 only. */
export function partnerPayLine(stage: StageKind, rec: PayRecord): PayLine {
  const status = payStatus(stage, rec);
  const expectedOn = expectedPayDate(rec);
  const line = (() => {
    switch (status) {
      case "paid":
        return `Paid on ${formatPayDate(rec.paidOn as string)}.`;
      case "not_payable":
        return "No referral fee is payable on this enquiry because it did not proceed to settlement (clause 5.5).";
      case "before_settlement":
        return (
          "A referral fee is payable only if the sale settles and the developer pays NextKey its fee for the lot " +
          "(clauses 5.1 and 5.5). We pay 100% of your fee within 14 days after we receive that fee, against your " +
          "valid tax invoice (clause 5.4). The figure shown is indicative until then (clause 5.3)."
        );
      case "awaiting_funds":
        return "Settled. We are waiting for the developer to pay NextKey. If and when it does, we pay you within 14 days, against your tax invoice (clause 5.4).";
      case "awaiting_invoice":
        return `We received the developer's fee on ${formatPayDate(rec.fundsReceivedOn as string)}. Please send your tax invoice. We pay within 14 days of receiving the fee (clause 5.4); if your invoice reaches us after that, we pay within 14 days of receiving your invoice.`;
      case "invoiced":
        return `Tax invoice received ${formatPayDate(rec.invoiceReceivedOn as string)}. Expected payment by ${formatPayDate(expectedOn as string)}.`;
    }
  })();
  return { status, label: PAY_STATUS_LABELS[status], line, expectedOn };
}

/**
 * Introducer wording (Springboard brand). DRAFT: restates the introducer
 * agreement's "When it is payable" paragraph, but it is new Springboard-facing
 * copy, so it needs YLA's written clause-7 approval (memory
 * springboard-licensing-clause7) before any introducer sees it. Until
 * INTRODUCER_PAY_WORDING_APPROVAL is filled in, nothing renders it.
 *
 * Before switching it on: the expected date must also be withheld where the
 * client's referral-fee disclosure is not on file or the introducer's
 * accreditation was not current at referral (the agreement withholds payment
 * in both cases; compliance review 17 Nov, B5).
 */
export function introducerPayLine(stage: StageKind, rec: PayRecord): PayLine {
  const status = payStatus(stage, rec);
  const expectedOn = expectedPayDate(rec);
  const labels: Record<PayStatus, string> = {
    ...PAY_STATUS_LABELS,
    awaiting_funds: "Awaiting funds",
    awaiting_invoice: "Send your invoice",
  };
  const line = (() => {
    switch (status) {
      case "paid":
        return `Paid on ${formatPayDate(rec.paidOn as string)}.`;
      case "not_payable":
        return "Nothing is payable on a referral that does not settle.";
      case "before_settlement":
        return (
          "Anything payable to you under your introducer agreement is earned when the matter settles, and is " +
          "payable once Springboard has received its fee for that matter in cleared funds. It is then paid within " +
          "14 days of your invoice. This is routinely several months after the referral. It is not near-term income."
        );
      case "awaiting_funds":
        return "Settled. Springboard has not yet received its fee for this matter in cleared funds. If and when it does, send us your invoice and we pay within 14 days of receiving it.";
      case "awaiting_invoice":
        return `Springboard received its fee for this matter on ${formatPayDate(rec.fundsReceivedOn as string)}. Send us your invoice: we pay within 14 days of receiving it.`;
      case "invoiced":
        return `Invoice received ${formatPayDate(rec.invoiceReceivedOn as string)}. Expected payment by ${formatPayDate(expectedOn as string)}.`;
    }
  })();
  return { status, label: labels[status], line, expectedOn };
}

/**
 * The introducer pay panel stays OFF until YLA approves the wording in writing
 * under clause 7 and Sean signs it off. Fill this in (who approved, the date,
 * where the approval is filed) in the same commit that switches it on.
 */
export const INTRODUCER_PAY_WORDING_APPROVAL: { approvedBy: string; approvedOn: string; record: string } | null = null;

export function introducerPayTimingEnabled(): boolean {
  return INTRODUCER_PAY_WORDING_APPROVAL !== null;
}

/** Overdue for staff eyes only: invoiced, past the expected date, not paid. */
export function payOverdue(stage: StageKind, rec: PayRecord, today: string): boolean {
  const exp = expectedPayDate(rec);
  return payStatus(stage, rec) === "invoiced" && exp !== null && today > exp;
}

// ── Staff input ──────────────────────────────────────────────────────────────

export type PayUpdate = {
  funds_received_on: string | null;
  invoice_received_on: string | null;
  fee_paid_on: string | null;
  fee_paid_amount: number | null;
};

function dateField(v: unknown, name: string, today: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (!isIsoDate(v)) return { ok: false, error: `${name} must be a date (YYYY-MM-DD).` };
  if (v > today) return { ok: false, error: `${name} can't be in the future.` };
  return { ok: true, value: v };
}

/**
 * Validate a staff-entered payment record. The whole record is sent and
 * replaces the old one, so clearing a field is sending it empty. Rules:
 *   - only on a settled deal (nothing is payable before settlement);
 *   - no future dates;
 *   - a paid date needs the fee-received and invoice dates, and can't precede
 *     either (clause 5.4: paid after the fee arrives, against an invoice);
 *   - a paid amount goes with a paid date, and is a positive dollar figure.
 */
export function parsePayUpdate(
  body: Record<string, unknown>,
  opts: { settled: boolean; today: string },
): { ok: true; update: PayUpdate } | { ok: false; error: string } {
  const funds = dateField(body.funds_received_on, "Fee received date", opts.today);
  if (!funds.ok) return funds;
  const invoice = dateField(body.invoice_received_on, "Invoice received date", opts.today);
  if (!invoice.ok) return invoice;
  const paid = dateField(body.fee_paid_on, "Paid date", opts.today);
  if (!paid.ok) return paid;

  let amount: number | null = null;
  const rawAmount = body.fee_paid_amount;
  if (rawAmount !== null && rawAmount !== undefined && rawAmount !== "") {
    const n = typeof rawAmount === "number" ? rawAmount : Number(String(rawAmount).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) {
      return { ok: false, error: "Amount paid must be a dollar amount above zero." };
    }
    amount = Math.round(n * 100) / 100;
  }

  const anySet = funds.value || invoice.value || paid.value || amount !== null;
  if (anySet && !opts.settled) {
    return { ok: false, error: "Payment dates can only be recorded once the deal has settled." };
  }
  if (paid.value) {
    if (!funds.value || !invoice.value) {
      return { ok: false, error: "Record the fee received and invoice received dates before marking it paid." };
    }
    if (paid.value < funds.value || paid.value < invoice.value) {
      return { ok: false, error: "The paid date can't be before the fee or the invoice was received." };
    }
  }
  if (amount !== null && !paid.value) {
    return { ok: false, error: "Enter the paid date with the amount paid." };
  }

  return {
    ok: true,
    update: {
      funds_received_on: funds.value,
      invoice_received_on: invoice.value,
      fee_paid_on: paid.value,
      fee_paid_amount: amount,
    },
  };
}

/**
 * The record a staff form was opened with, for the conditional write. Null
 * unless all four keys are present and each is null or well formed.
 */
export function parseExpectedPay(v: unknown): PayUpdate | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const d = (x: unknown) => (x === null ? null : isIsoDate(x) ? x : undefined);
  const f = d(o.funds_received_on);
  const i = d(o.invoice_received_on);
  const p = d(o.fee_paid_on);
  const raw = o.fee_paid_amount;
  const a = raw === null ? null : typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
  if (f === undefined || i === undefined || p === undefined || a === undefined) return null;
  return { funds_received_on: f, invoice_received_on: i, fee_paid_on: p, fee_paid_amount: a };
}

/**
 * DB row (snake_case, numeric may arrive as a string) to PayRecord. A value
 * that is present but unreadable is logged, never silently read as "not yet":
 * a paid deal must not quietly show as unpaid.
 */
export function payRecordFromRow(row: Record<string, unknown> | null | undefined): PayRecord {
  if (!row) return EMPTY_PAY_RECORD;
  const date = (key: string) => {
    const v = row[key];
    if (v === null || v === undefined) return null;
    if (isIsoDate(v)) return v;
    console.error("[partner-pay] unreadable date in pay record", { id: row.id, key, value: String(v) });
    return null;
  };
  const amt = row.fee_paid_amount;
  let paidAmount: number | null = null;
  if (amt !== null && amt !== undefined) {
    const n = Number(amt);
    if (Number.isFinite(n)) paidAmount = n;
    else console.error("[partner-pay] unreadable amount in pay record", { id: row.id, value: String(amt) });
  }
  return {
    fundsReceivedOn: date("funds_received_on"),
    invoiceReceivedOn: date("invoice_received_on"),
    paidOn: date("fee_paid_on"),
    paidAmount,
  };
}

export const PAY_COLUMN_NAMES = ["funds_received_on", "invoice_received_on", "fee_paid_on", "fee_paid_amount"] as const;
export const PAY_COLUMNS = PAY_COLUMN_NAMES.join(",");

/**
 * True only when the error says one of THESE four columns is missing: the
 * migration is not applied, or PostgREST's schema cache has not caught up.
 * Covers PGRST204 on writes as well as 42703 on reads (utils/column-missing.ts);
 * any other column error is a real fault and is not swallowed.
 */
export function payColumnsMissing(error: PgLikeError): boolean {
  return columnMissing(error, PAY_COLUMN_NAMES);
}

// ── Monthly statement ────────────────────────────────────────────────────────

export type StatementDeal = {
  id: string;
  lotRef: string | null;
  clientName: string;
  /** Brisbane calendar date the deal was marked settled. */
  settledOn: string;
  /** The partner's own indicative fee (null when their plan hides fees). */
  indicativeFee: number | null;
  pay: PayRecord;
};

export type StatementRow = StatementDeal & PayLine & { amount: number | null; amountIsPaid: boolean };

export type StatementMonth = { month: string; label: string; rows: StatementRow[]; paidTotal: number; unpaidTotal: number };

export type StatementTotals = Record<"awaiting_funds" | "awaiting_invoice" | "invoiced" | "paid", { count: number; amount: number }>;

/**
 * Settled deals grouped by month: a paid deal sits in the month it was paid,
 * an unpaid one in the month it settled. Newest month first. Amounts are the
 * partner's own fee: what was paid if paid, else the indicative figure.
 */
export function buildStatement(deals: StatementDeal[]): { months: StatementMonth[]; totals: StatementTotals } {
  const totals: StatementTotals = {
    awaiting_funds: { count: 0, amount: 0 },
    awaiting_invoice: { count: 0, amount: 0 },
    invoiced: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
  };
  const byMonth = new Map<string, StatementRow[]>();
  for (const d of deals) {
    const pl = partnerPayLine("settled", d.pay);
    const amountIsPaid = pl.status === "paid" && d.pay.paidAmount !== null;
    const amount = amountIsPaid ? d.pay.paidAmount : d.indicativeFee;
    const row: StatementRow = { ...d, ...pl, amount, amountIsPaid };
    const key = (pl.status === "paid" && d.pay.paidOn ? d.pay.paidOn : d.settledOn).slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), row]);
    if (pl.status in totals) {
      const t = totals[pl.status as keyof StatementTotals];
      t.count += 1;
      t.amount += amount ?? 0;
    }
  }
  const months = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, rows]) => ({
      month,
      label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-AU", { timeZone: "UTC", month: "long", year: "numeric" }),
      rows,
      paidTotal: rows.filter((r) => r.status === "paid").reduce((s, r) => s + (r.amount ?? 0), 0),
      unpaidTotal: rows.filter((r) => r.status !== "paid").reduce((s, r) => s + (r.amount ?? 0), 0),
    }));
  return { months, totals };
}

/** The NextKey response standard. NextKey-branded portal only (not white-label, not Springboard). */
// Sean asked for "We reply to every referral within 1 business day." The
// compliance guardian (17 Nov) changed it to "aim to": an absolute promise about
// future conduct needs reasonable grounds (ACL s4, s18 applies B2B). Sean can
// restore the absolute form once a monitored queue + auto-acknowledgement exist.
export const PARTNER_RESPONSE_STANDARD = "We aim to respond to every referral within 1 business day.";
