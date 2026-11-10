/**
 * Bridge: borrowing-capacity engine → Borrower Fact Find.
 *
 * The reverse of `utils/factfind-capacity.ts`. Where that module READS a fact
 * find to drive the servicing calculator, this one WRITES a calculator's
 * financial position back onto an existing fact find, so an advisor can persist
 * a scenario without re-keying it.
 *
 * It is an OVERLAY, not a replacement. Identity (applicant names, addresses,
 * DOB…), disclosures, advisors, the loan request, securities and declarations
 * are all carried through untouched — only the overlapping financial fields are
 * rewritten from the calculator, which is the source of truth in this direction:
 *   • applicant income + HECS,
 *   • the Property assets + Mortgage/Credit-card liabilities,
 *   • the household servicing figures (dependents, living expenses).
 *
 * MERGE, NOT REBUILD. The fact find is a signed compliance document, so the
 * assets/liabilities tables are merged by CATEGORY, never wiped: the calculator
 * only cleanly owns Property assets and Mortgage / Credit-card liabilities, so
 * only those row kinds are replaced. Everything else the borrower disclosed —
 * cash at bank, superannuation, motor vehicles, personal effects, shares, an
 * overdraft, a car lease, other loans — survives untouched. Replacing only the
 * owned kinds is also idempotent: a second save can't accumulate duplicates.
 *
 * The calculator's personal/car/other MONTHLY debt figures and its consumer-debt
 * BALANCE are deliberately NOT written back — they have no clean row identity on
 * the form and writing them would risk clobbering or duplicating manual rows.
 * The advisor is told to enter those directly. Every derived/assumed step and
 * every deliberate omission is reported in `notes`.
 *
 * Pure. Tested in `utils/capacityToFactFind.test.ts`.
 */

import type { Applicant, Asset, FactFindData, Liability } from "./factfind";
import { pAndIMonthly, type CapacityInputs } from "./finance";

const numOrNull = (v: number | null | undefined): number | null =>
  typeof v === "number" && isFinite(v) ? v : null;

export function capacityInputsToFactFind(
  inputs: CapacityInputs,
  base: FactFindData,
): { data: FactFindData; notes: string[] } {
  const notes: string[] = [];
  const properties = inputs.properties ?? [];

  // Stable, run-scoped row ids. The `-cap-` marker makes it obvious in the
  // stored blob that a row came from the calculator, not the paper form.
  let seq = 0;
  const rowId = (prefix: string) => `${prefix}-cap-${seq++}`;

  // ─── Applicants — overlay servicing fields, keep identity ──────────────────
  const applicants = base.applicants.map((a) => ({ ...a })) as [Applicant, Applicant];
  applicants[0] = {
    ...applicants[0],
    annual_income: numOrNull(inputs.income),
    has_hecs: !!inputs.hasHecs,
    hecs_balance: numOrNull(inputs.hecsBalance),
  };
  if (applicants.length >= 2) {
    applicants[1] = {
      ...applicants[1],
      annual_income: numOrNull(inputs.partner),
      has_hecs: !!inputs.partnerHasHecs,
      hecs_balance: numOrNull(inputs.partnerHecsBalance),
    };
  } else {
    notes.push(
      "No second applicant slot on the fact find — partner income/HECS could not be stored.",
    );
  }

  // ─── Assets — replace ONLY Property rows; keep everything else ─────────────
  // Cash at bank, Superannuation, Motor vehicle, Personal effects, Business
  // value, Shares and investments, Deposit paid on property all survive.
  const preservedAssets = base.financials.assets.filter((a) => a.kind !== "Property");
  const propertyAssets: Asset[] = properties.map((p) => ({
    id: rowId("asset"),
    kind: "Property",
    label: p.label || "Property",
    value: numOrNull(p.value),
  }));
  const assets: Asset[] = [...preservedAssets, ...propertyAssets];

  // ─── Liabilities — replace ONLY Mortgage + Credit card; keep the rest ──────
  // Manually-entered Car lease, Overdraft and Other loan rows survive untouched.
  const preservedLiabilities = base.financials.liabilities.filter(
    (l) => l.kind !== "Mortgage" && l.kind !== "Credit card",
  );

  let mortgageMonthlyDerived = false;
  const mortgageLiabilities: Liability[] = [];
  for (const p of properties) {
    if (p.loanBalance <= 0) continue;
    const monthly = pAndIMonthly(p.loanBalance, p.rate, p.termRemaining);
    if (monthly > 0) mortgageMonthlyDerived = true;
    mortgageLiabilities.push({
      id: rowId("liab"),
      kind: "Mortgage",
      label: p.label || "Mortgage",
      balance: numOrNull(p.loanBalance),
      monthly: monthly > 0 ? Math.round(monthly) : null,
    });
  }

  // A credit card's "balance" is its LIMIT on this form — the same convention
  // `factFindToCapacityInputs` reads back out (it assesses the balance column as
  // the limit at 3.8%/month).
  const cardLiabilities: Liability[] = [];
  if (inputs.creditLimit > 0) {
    cardLiabilities.push({
      id: rowId("liab"),
      kind: "Credit card",
      label: "",
      balance: Math.round(inputs.creditLimit),
      monthly: null,
    });
  }

  const liabilities: Liability[] = [
    ...preservedLiabilities,
    ...mortgageLiabilities,
    ...cardLiabilities,
  ];

  // ─── Notes ─────────────────────────────────────────────────────────────────
  if (properties.length > 0) {
    notes.push(
      "Mortgage rows were replaced from the calculator's property portfolio — confirm no " +
        "manually-entered mortgage the calculator doesn't hold was lost.",
    );
    notes.push(
      "Existing properties were written as paired Property (asset) + Mortgage (liability) rows; " +
        "their rent, use and interest-rate detail has no home on the fact find and was not stored.",
    );
    if (mortgageMonthlyDerived) {
      notes.push(
        "Existing-mortgage monthly repayments were derived (P&I) from each property's rate and " +
          "remaining term — the calculator holds no explicit repayment figure.",
      );
    }
  }
  if (inputs.creditLimit > 0) {
    notes.push(
      "Credit-card limit stored in the fact find's balance column (the form records the limit there, not the drawn balance).",
    );
  }
  notes.push(
    "The calculator's personal/car/other monthly debts and any consumer-debt balance were not " +
      "written back — enter these on the fact find directly.",
  );

  // ─── Assemble — everything not listed above passes through untouched ───────
  const data: FactFindData = {
    ...base,
    applicants,
    financials: {
      ...base.financials,
      assets,
      liabilities,
      servicing: {
        dependents: numOrNull(inputs.dependents),
        monthly_living_expenses: numOrNull(inputs.declaredExpenses),
      },
    },
  };

  return { data, notes };
}
