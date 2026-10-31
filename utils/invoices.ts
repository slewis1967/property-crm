/**
 * Tax invoices: the rules, as pure functions shared by the routes, the screens
 * and the PDF. Money is whole cents throughout, so GST never drifts on a float.
 *
 * What a tax invoice must show comes from the ATO's "Tax invoices" guide and
 * GSTR 2013/1 (checked 31 Oct 2026). A registered business name is enough to
 * identify the seller, which is what lets a Springboard invoice show only the
 * Springboard name plus the ABN.
 */

export const INVOICE_STATUSES = ["draft", "issued", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Registered business names on the NextKey ABN (ABR, 28 Oct 2026). */
export const TRADING_NAMES = ["Springboard Homes", "Quick Edge AI", "foundfave"] as const;

export const BUYER_ID_THRESHOLD_CENTS = 100_000;

export type LineGst = "taxable" | "free";

export type InvoiceLine = {
  description: string;
  quantity: number;
  unit_cents: number;
  gst: LineGst;
};

export type Invoice = {
  id: string;
  number: number | null;
  status: InvoiceStatus;
  source: "crm" | "conta_import";
  trading_as: string | null;
  issue_date: string | null;
  due_date: string | null;
  buyer_name: string | null;
  buyer_abn: string | null;
  buyer_email: string | null;
  buyer_address: string | null;
  reference: string | null;
  notes: string | null;
  internal_note: string | null;
  lines: InvoiceLine[];
  amounts_include_gst: boolean;
  subtotal_cents: number;
  gst_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  contact_id: string | null;
  revenue_deal_id: string | null;
  issued_at: string | null;
  sent_at: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
  paid_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

export type InvoiceSettings = {
  seller_name: string;
  abn: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  cc_emails: string | null;
  bank_name: string | null;
  bsb: string | null;
  account_name: string | null;
  account_number: string | null;
  next_number: number;
  default_terms_days: number;
};

export const INVOICE_MIGRATION_HINT =
  "Invoices aren't set up yet: run migrations/20261031_invoices.sql in the Supabase SQL editor.";

/** Table-level codes only, so a column error can't pose as a missing migration. */
export function invoicesTableMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205" || code === "PGRST202" || code === "42883";
}

export function invoiceErrMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message || fallback;
  const message = (e as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
}

// ── money ────────────────────────────────────────────────────────────────────

/** "12,500.50", "$12500.5" or 12500.5 to cents. Null if it isn't a clean amount. */
export function parseMoneyToCents(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  const cleaned = raw.replace(/[$,\s]/g, "");
  const match = /^(-?)(\d*)(?:\.(\d{1,2})\d*)?$/.exec(cleaned);
  if (!match || (!match[2] && !match[3])) return null;
  const dollars = Number(match[2] || "0");
  const cents = Number((match[3] ?? "").padEnd(2, "0") || "0");
  const total = dollars * 100 + cents;
  return match[1] ? -total : total;
}

export function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-AU");
  const remainder = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}$${dollars}.${remainder}`;
}

export function lineAmountCents(line: InvoiceLine): number {
  return Math.round(line.quantity * line.unit_cents);
}

export type InvoiceTotals = { subtotal_cents: number; gst_cents: number; total_cents: number };

/**
 * GST is worked out once on the invoice's taxable total, not line by line, so it
 * matches the 1/11 statement on the document. When prices include GST the total
 * is what was typed and GST is 1/11 of the taxable part. When they exclude it,
 * GST is 10% on top. `subtotal_cents` is always the amount before GST.
 */
export function computeTotals(lines: InvoiceLine[], amountsIncludeGst: boolean): InvoiceTotals {
  let taxable = 0;
  let free = 0;
  for (const line of lines) {
    if (line.gst === "free") free += lineAmountCents(line);
    else taxable += lineAmountCents(line);
  }
  if (amountsIncludeGst) {
    const gst = Math.round(taxable / 11);
    const total = taxable + free;
    return { subtotal_cents: total - gst, gst_cents: gst, total_cents: total };
  }
  const gst = Math.round(taxable / 10);
  const subtotal = taxable + free;
  return { subtotal_cents: subtotal, gst_cents: gst, total_cents: subtotal + gst };
}

/** Keep only well-formed lines. Bad numbers become 0 rather than NaN in a total. */
export function coerceLines(value: unknown): InvoiceLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): InvoiceLine[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const quantity = typeof r.quantity === "number" ? r.quantity : Number(r.quantity);
    const unit = typeof r.unit_cents === "number" ? Math.round(r.unit_cents) : Number(r.unit_cents);
    return [
      {
        description: typeof r.description === "string" ? r.description.slice(0, 1000) : "",
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit_cents: Number.isFinite(unit) ? Math.round(unit) : 0,
        gst: r.gst === "free" ? "free" : "taxable",
      },
    ];
  });
}

// ── ABN + dates ──────────────────────────────────────────────────────────────

/** The ABR's published modulus 89 check. */
export function isValidAbn(value: string): boolean {
  const digits = value.replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = [...digits].reduce((acc, d, i) => acc + (Number(d) - (i === 0 ? 1 : 0)) * weights[i], 0);
  return sum % 89 === 0;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** 'YYYY-MM-DD' to 'DD/MM/YYYY' for the document. No Date, so no timezone slip. */
export function formatInvoiceDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ── state ────────────────────────────────────────────────────────────────────

export function balanceCents(inv: Pick<Invoice, "total_cents" | "amount_paid_cents">): number {
  return Math.max(0, inv.total_cents - inv.amount_paid_cents);
}

export type InvoiceState = "draft" | "unpaid" | "part_paid" | "overdue" | "paid" | "void";

export function invoiceState(
  inv: Pick<Invoice, "status" | "due_date" | "total_cents" | "amount_paid_cents">,
  today: string,
): InvoiceState {
  if (inv.status === "draft" || inv.status === "void" || inv.status === "paid") {
    return inv.status;
  }
  if (inv.due_date && inv.due_date < today) return "overdue";
  return inv.amount_paid_cents > 0 ? "part_paid" : "unpaid";
}

export const STATE_LABEL: Record<InvoiceState, string> = {
  draft: "Draft",
  unpaid: "Unpaid",
  part_paid: "Part paid",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

export type InvoiceSummary = {
  outstandingCents: number;
  overdueCents: number;
  overdueCount: number;
  draftCount: number;
};

export function summariseInvoices(
  invoices: Pick<Invoice, "status" | "due_date" | "total_cents" | "amount_paid_cents">[],
  today: string,
): InvoiceSummary {
  const summary: InvoiceSummary = { outstandingCents: 0, overdueCents: 0, overdueCount: 0, draftCount: 0 };
  for (const inv of invoices) {
    if (inv.status === "draft") summary.draftCount += 1;
    if (inv.status !== "issued") continue;
    summary.outstandingCents += balanceCents(inv);
    if (invoiceState(inv, today) === "overdue") {
      summary.overdueCents += balanceCents(inv);
      summary.overdueCount += 1;
    }
  }
  return summary;
}

/** The payment status that follows from what's been received. */
export function statusAfterPayments(totalCents: number, paidCents: number): "issued" | "paid" {
  return totalCents > 0 && paidCents >= totalCents ? "paid" : "issued";
}

// ── issuing ──────────────────────────────────────────────────────────────────

/** What stops this draft being a valid tax invoice. Empty means it can be issued. */
export function issueProblems(
  inv: Pick<
    Invoice,
    "trading_as" | "issue_date" | "due_date" | "buyer_name" | "buyer_abn" | "lines" | "amounts_include_gst"
  >,
  settings: Pick<InvoiceSettings, "seller_name" | "abn" | "bsb" | "account_number" | "account_name">,
): string[] {
  const problems: string[] = [];
  if (!settings.seller_name.trim()) problems.push("Add the seller's name in invoice settings.");
  if (!isValidAbn(settings.abn)) problems.push("The seller ABN in invoice settings isn't a valid ABN.");
  if (!settings.bsb || !settings.account_number || !settings.account_name) {
    problems.push("Add bank details in invoice settings, so the customer can pay.");
  }
  if (inv.trading_as && !(TRADING_NAMES as readonly string[]).includes(inv.trading_as)) {
    problems.push("Trading name isn't one of the registered business names.");
  }

  const lines = inv.lines ?? [];
  if (lines.length === 0) problems.push("Add at least one line.");
  if (lines.some((l) => !l.description.trim())) problems.push("Every line needs a description.");
  if (lines.some((l) => !(l.quantity > 0))) problems.push("Every line needs a quantity above zero.");

  const { total_cents: total } = computeTotals(lines, inv.amounts_include_gst);
  if (lines.length > 0 && total <= 0) problems.push("The invoice total must be above zero.");

  const hasBuyerId = !!inv.buyer_name?.trim() || !!inv.buyer_abn?.trim();
  if (total >= BUYER_ID_THRESHOLD_CENTS && !hasBuyerId) {
    problems.push("Sales of $1,000 or more must show the buyer's name or ABN.");
  }
  if (!inv.buyer_name?.trim() && total < BUYER_ID_THRESHOLD_CENTS) {
    problems.push("Add who the invoice is to.");
  }
  if (inv.buyer_abn?.trim() && !isValidAbn(inv.buyer_abn)) problems.push("The buyer's ABN isn't valid.");

  if (inv.issue_date && !isIsoDate(inv.issue_date)) problems.push("The invoice date isn't valid.");
  if (!inv.due_date || !isIsoDate(inv.due_date)) problems.push("Add a due date.");
  if (inv.issue_date && inv.due_date && inv.due_date < inv.issue_date) {
    problems.push("The due date is before the invoice date.");
  }
  return problems;
}

/** The name on the document: the registered business name if set, else the legal one. */
export function sellerDisplayName(
  inv: Pick<Invoice, "trading_as">,
  settings: Pick<InvoiceSettings, "seller_name">,
): string {
  return inv.trading_as || settings.seller_name;
}

export function invoiceTitle(inv: Pick<Invoice, "number" | "status">): string {
  return inv.number ? `Tax invoice ${inv.number}` : "Draft invoice";
}

export function splitEmails(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The covering email. The tax invoice itself is the attached PDF. */
export function invoiceEmail(
  inv: Pick<
    Invoice,
    "number" | "trading_as" | "total_cents" | "amount_paid_cents" | "due_date" | "reference"
  >,
  settings: Pick<InvoiceSettings, "seller_name" | "bsb" | "account_number" | "account_name">,
  kind: "invoice" | "reminder",
  today: string,
): { subject: string; html: string } {
  const seller = escapeHtml(sellerDisplayName(inv, settings));
  const balance = formatCents(balanceCents(inv));
  const due = formatInvoiceDate(inv.due_date);
  const late = inv.due_date ? Math.max(0, daysBetween(inv.due_date, today)) : 0;
  const reference = inv.reference ? `<p>Reference: ${escapeHtml(inv.reference)}</p>` : "";
  const bank = `<p>Pay to ${escapeHtml(settings.account_name)}<br>BSB ${escapeHtml(settings.bsb)}, account ${escapeHtml(settings.account_number)}<br>Please quote invoice ${inv.number}.</p>`;

  if (kind === "reminder") {
    return {
      subject: `Payment reminder: invoice ${inv.number} from ${sellerDisplayName(inv, settings)}`,
      html: `<p>Hello,</p><p>Our records show ${balance} is still unpaid on invoice ${inv.number}, which was due on ${due}${late > 0 ? ` (${late} ${late === 1 ? "day" : "days"} ago)` : ""}. A copy is attached.</p>${reference}${bank}<p>If you've already paid, please ignore this and accept our thanks.</p><p>Kind regards,<br>${seller}</p>`,
    };
  }
  return {
    subject: `Tax invoice ${inv.number} from ${sellerDisplayName(inv, settings)}`,
    html: `<p>Hello,</p><p>Tax invoice ${inv.number} for ${balance} is attached, due on ${due}.</p>${reference}${bank}<p>Thank you for your business.</p><p>Kind regards,<br>${seller}</p>`,
  };
}
