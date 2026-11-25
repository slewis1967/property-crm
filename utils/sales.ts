/**
 * The sale record: a deal (partner_enquiries row) seen as a developer's sales
 * portal sees it — contract stages, key dates, the two-part deposit, files,
 * payments. Pure functions only; the routes and pages share them.
 *
 * Partner deals and NextKey's direct sales (partner_id NULL) are the same rows.
 * Stage rules live in utils/partner.ts; this file only adds the sale view.
 */
import { DEAL_STAGES, isDealStage, STAFF_TRANSITIONS, type DealStage } from "./partner";

export const SALE_FILES_BUCKET = "deal-files";
export const SALE_MIGRATION_HINT = "Run migrations/20261125_deal_sales_record.sql in the Supabase SQL editor.";
export const MAX_SALE_FILE_BYTES = 50 * 1024 * 1024;

/** Stages in the order the progress path shows them. */
export const SALE_PATH: readonly DealStage[] = ["requested", "hold", "eoi", "contract_issued", "unconditional", "settled"];

/** Staff-facing names. Partners keep DEAL_STAGE_LABELS ("Hold requested", ...). */
export const SALE_STAGE_LABELS: Record<DealStage, string> = {
  requested: "New",
  hold: "Reserved",
  eoi: "EOI signed",
  contract_issued: "Contract issued",
  unconditional: "Exchanged",
  settled: "Settled",
  declined: "Declined",
  released: "Lost / released",
  withdrawn: "Withdrawn",
};

export const LOST_STAGES: ReadonlySet<DealStage> = new Set(["declined", "released", "withdrawn"]);

/**
 * Moves allowed on a DIRECT sale. Partner deals go through the partner admin
 * route instead, because each move there notifies the partner.
 * Same graph as partners, plus New -> Reserved being an ordinary move.
 */
export function directSaleNextStages(from: string): DealStage[] {
  if (!isDealStage(from)) return [];
  return [...STAFF_TRANSITIONS[from]];
}

export function saleStageLabel(stage: string): string {
  return isDealStage(stage) ? SALE_STAGE_LABELS[stage] : stage;
}

// ── Editable fields ──────────────────────────────────────────────────────────

type FieldKind = "text" | "date" | "money" | "bool";

/** Every column staff may edit from the sale page, and how to parse it. */
export const SALE_FIELDS: Record<string, FieldKind> = {
  sale_ref: "text",
  project_name: "text",
  developer_name: "text",
  unit_no: "text",
  colour_selection: "text",
  sale_owner: "text",
  contact_id: "text",
  buyer_names: "text",
  buyer_email: "text",
  buyer_phone: "text",
  buyer_address: "text",
  buyer_solicitor: "text",
  buyer_broker: "text",
  guarantor: "text",
  firb_required: "bool",
  lead_source: "text",
  conditions: "text",
  clause_amendments: "text",
  sale_price: "money",
  anticipated_exchange_date: "date",
  exchange_date: "date",
  cooling_off_waived: "bool",
  cooling_off_expires: "date",
  anticipated_settlement_date: "date",
  settlement_date: "date",
  deposit_initial_required: "money",
  deposit_initial_due_date: "date",
  deposit_balance_required: "money",
  deposit_balance_due_date: "date",
  deposit_returned: "bool",
  lost_reason: "text",
  staff_notes: "text",
  external_source: "text",
  external_url: "text",
};

const NOT_NULL_BOOLS = new Set(["cooling_off_waived", "deposit_returned"]);

/**
 * Parse an edit body into a column update. Unknown keys are ignored; a bad
 * value is an error, never silently dropped.
 */
export function parseSaleUpdate(body: Record<string, unknown>): { update: Record<string, unknown> } | { error: string } {
  const update: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(body)) {
    const kind = SALE_FIELDS[key];
    if (!kind) continue;
    if (raw === null || raw === "") {
      if (NOT_NULL_BOOLS.has(key)) return { error: `${key} can't be empty.` };
      update[key] = null;
      continue;
    }
    switch (kind) {
      case "text": {
        if (typeof raw !== "string") return { error: `${key} must be text.` };
        update[key] = raw.trim().slice(0, 4000) || null;
        break;
      }
      case "date": {
        if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
          return { error: `${key} must be a date (YYYY-MM-DD).` };
        }
        update[key] = raw;
        break;
      }
      case "money": {
        const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,\s]/g, ""));
        if (!Number.isFinite(n) || n < 0 || n > 1e9) return { error: `${key} must be an amount.` };
        update[key] = Math.round(n * 100) / 100;
        break;
      }
      case "bool": {
        if (typeof raw !== "boolean") return { error: `${key} must be true or false.` };
        update[key] = raw;
        break;
      }
    }
  }
  if (typeof update.external_url === "string" && !/^https:\/\//.test(update.external_url)) {
    return { error: "external_url must be an https link." };
  }
  return { update };
}

// ── Deposit ─────────────────────────────────────────────────────────────────

export type SalePayment = {
  id: string;
  kind: "initial_deposit" | "balance_deposit" | "refund" | "other";
  amount: number;
  received_on: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
};

export type DepositPosition = {
  initialRequired: number;
  initialReceived: number;
  initialOutstanding: number;
  initialPaid: boolean;
  balanceRequired: number;
  balanceReceived: number;
  balanceOutstanding: number;
  balancePaid: boolean;
  totalRequired: number;
  totalReceived: number;
  refunded: number;
};

const cents = (n: number) => Math.round(n * 100) / 100;

export function depositPosition(
  sale: { deposit_initial_required: number | null; deposit_balance_required: number | null },
  payments: Pick<SalePayment, "kind" | "amount">[],
): DepositPosition {
  const sum = (kind: SalePayment["kind"]) => cents(payments.filter((p) => p.kind === kind).reduce((s, p) => s + Number(p.amount), 0));
  const initialRequired = Number(sale.deposit_initial_required ?? 0);
  const balanceRequired = Number(sale.deposit_balance_required ?? 0);
  const initialReceived = sum("initial_deposit");
  const balanceReceived = sum("balance_deposit");
  return {
    initialRequired,
    initialReceived,
    initialOutstanding: cents(Math.max(0, initialRequired - initialReceived)),
    initialPaid: initialRequired > 0 && initialReceived >= initialRequired,
    balanceRequired,
    balanceReceived,
    balanceOutstanding: cents(Math.max(0, balanceRequired - balanceReceived)),
    balancePaid: balanceRequired > 0 && balanceReceived >= balanceRequired,
    totalRequired: cents(initialRequired + balanceRequired),
    totalReceived: cents(initialReceived + balanceReceived),
    refunded: sum("refund"),
  };
}

// ── Next step ───────────────────────────────────────────────────────────────

export type SaleDates = {
  stage: string;
  hold_expires_at: string | null;
  anticipated_exchange_date: string | null;
  exchange_date: string | null;
  cooling_off_waived: boolean | null;
  cooling_off_expires: string | null;
  anticipated_settlement_date: string | null;
  settlement_date: string | null;
  deposit_initial_due_date: string | null;
  deposit_balance_due_date: string | null;
};

export type NextStep = { label: string; due: string | null; overdue: boolean };

export function formatSaleDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * The one thing that has to happen next on this sale, and by when — the list's
 * "Next step" column. `today` is a YYYY-MM-DD in Brisbane time.
 */
export function nextStep(sale: SaleDates, deposit: DepositPosition, today: string): NextStep | null {
  const step = (label: string, due: string | null): NextStep => ({
    label: due ? `${label} by ${formatSaleDate(due)}` : label,
    due,
    overdue: !!due && due < today,
  });
  const stage = sale.stage;
  if (!isDealStage(stage) || LOST_STAGES.has(stage)) return null;

  if (stage === "settled") return { label: `Settled ${formatSaleDate(sale.settlement_date)}`.trim(), due: null, overdue: false };
  if (stage === "requested") return step("Approve and reserve", null);

  // A deposit that is due comes ahead of everything else while the sale is live.
  if (deposit.initialRequired > 0 && !deposit.initialPaid) {
    return step(`Initial deposit $${deposit.initialOutstanding.toLocaleString("en-AU")} due`, sale.deposit_initial_due_date);
  }

  if (stage === "hold") {
    if (sale.hold_expires_at) return step("Hold expires", sale.hold_expires_at.slice(0, 10));
    return step("EOI to be signed", null);
  }
  if (stage === "eoi") return step("Contract to be issued", null);
  if (stage === "contract_issued") return step("Exchange due", sale.anticipated_exchange_date);

  // unconditional (exchanged)
  if (!sale.cooling_off_waived && sale.cooling_off_expires && sale.cooling_off_expires >= today) {
    return step("Cooling-off ends", sale.cooling_off_expires);
  }
  if (deposit.balanceRequired > 0 && !deposit.balancePaid) {
    return step(`Balance deposit $${deposit.balanceOutstanding.toLocaleString("en-AU")} due`, sale.deposit_balance_due_date);
  }
  return step("Settlement due", sale.anticipated_settlement_date);
}

/** Stages from which a sale holds stock. Mirrors ACTIVE_HOLD_STAGES. */
export function isLiveSale(stage: string): boolean {
  return isDealStage(stage) && !LOST_STAGES.has(stage) && stage !== "settled";
}

export const ALL_SALE_STAGES = DEAL_STAGES;
