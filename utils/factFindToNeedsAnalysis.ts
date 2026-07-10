/**
 * Pre-fill bridge: seed an NCCP Client Needs Analysis from an existing Borrower
 * Fact Find so borrower identity, financial position and loan basics aren't
 * re-keyed.
 *
 * The two documents are deliberately separate compliance artefacts
 * (utils/factfind.ts, utils/needsAnalysis.ts). This function does a *narrow,
 * verifiable* overlay: it starts from `emptyNeedsAnalysis()` and only writes a
 * field when the correspondence is genuine. Where a value can't be mapped
 * cleanly — an ambiguous asset/liability type, a household total that has no
 * per-applicant home, a Fact-Find-only field with no Needs-Analysis counterpart
 * — it leaves the Needs Analysis blank (or picks a safe generic type) and
 * records the decision in `notes`.
 *
 * The result is a REVIEWABLE DRAFT. A wrong carried-over value is worse than a
 * blank one, so nothing here guesses: every assumption is surfaced for the
 * advisor to confirm.
 *
 * Pure — no I/O, no mutation of the input.
 */

import type { FactFindData } from "./factfind";
import {
  emptyNeedsAnalysis,
  emptyAsset as emptyNaAsset,
  emptyLiability as emptyNaLiability,
  type NeedsAnalysisData,
  type AssetType,
  type LiabilityType,
} from "./needsAnalysis";

/** Fact Find asset kind → Needs Analysis asset type. `null` = no safe mapping. */
function mapAssetType(kind: string): { type: AssetType; note?: string } {
  switch (kind) {
    case "Property":
      // The Fact Find doesn't distinguish home from investment — default to the
      // owner-occupied row but flag it, since it could be an investment property.
      return { type: "Principal Home", note: 'verify — a Fact Find "Property" could be an investment property' };
    case "Cash at bank":
      return { type: "Savings Account" };
    case "Motor vehicle":
      return { type: "Motor Vehicle" };
    case "Personal effects":
      return { type: "Home Contents" };
    case "Superannuation":
      return { type: "Superannuation" };
    case "Deposit paid on property":
    case "Business value":
    case "Shares and investments":
      return { type: "Other", note: `no direct Needs Analysis category — mapped to "Other"` };
    default:
      return { type: "Other", note: `unrecognised type — mapped to "Other"` };
  }
}

/** Fact Find liability kind → Needs Analysis liability type. */
function mapLiabilityType(kind: string): { type: LiabilityType; note?: string } {
  switch (kind) {
    case "Mortgage":
      return { type: "Home Loan" };
    case "Car lease":
      return { type: "Car Loan" };
    case "Credit card":
      return { type: "Credit Card" };
    case "Overdraft":
    case "Other loan":
      return { type: "Other", note: `no direct Needs Analysis category — mapped to "Other"` };
    default:
      return { type: "Other", note: `unrecognised type — mapped to "Other"` };
  }
}

/** "$400,000" for a note, or "an unspecified amount" when null. */
function money(n: number | null | undefined): string {
  if (typeof n !== "number" || !isFinite(n)) return "an unspecified amount";
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

export function factFindToNeedsAnalysis(ff: FactFindData): { data: NeedsAnalysisData; notes: string[] } {
  const data = emptyNeedsAnalysis();
  const notes: string[] = [];

  /* ── Loan basics ──────────────────────────────────────────────────────── */
  if (ff.loan.amount_required != null) data.loan_amount_sought = ff.loan.amount_required;
  if (ff.loan.purpose.trim()) data.needs_objectives = ff.loan.purpose.trim();
  // interview_type / location / date_time / first_home_buyer are interview-time
  // facts the Fact Find never captured — left blank/null by design.

  /* ── Applicants (up to 2) ─────────────────────────────────────────────── */
  const hasName = (n: number) =>
    Boolean(ff.applicants[n]?.family_name.trim() || ff.applicants[n]?.given_names.trim());
  const twoApplicants = hasName(0) && hasName(1);

  ff.applicants.forEach((a, i) => {
    if (i > 1) return; // both shapes are exactly two applicants, but be defensive
    const na = data.applicants[i];

    if (a.title) na.title = a.title;
    if (a.family_name) na.surname = a.family_name;
    if (a.given_names) na.given_names = a.given_names;
    if (a.date_of_birth) na.dob = a.date_of_birth;
    if (a.email) na.contact.email = a.email;
    if (a.phone_home) na.contact.home_phone = a.phone_home;
    if (a.phone_work) na.contact.work_phone = a.phone_work;
    if (a.drivers_licence) na.additional.id_document = a.drivers_licence;
    if (a.occupation) na.current_employment.occupation = a.occupation;

    // Address: the Fact Find keeps a single free-text address + a postcode; the
    // Needs Analysis wants street / suburb / state / postcode split out. Carry
    // the raw string into `street` and the postcode, and flag the split.
    if (a.address.trim()) {
      na.current_address.street = a.address.trim();
      notes.push(
        `Applicant ${i + 1}: home address carried as a single line into "street" — split out suburb/state before completing.`,
      );
    }
    if (a.postcode) na.current_address.postcode = a.postcode;

    // Income: the Fact Find only records a gross annual figure.
    if (a.annual_income != null) {
      na.current_employment.income_amount = a.annual_income;
      na.current_employment.income_gross_or_net = "gross";
      na.current_employment.pay_frequency = "pa";
      notes.push(
        `Applicant ${i + 1}: income carried as gross annual (${money(a.annual_income)} p.a.) — confirm frequency/gross-vs-net.`,
      );
    }

    // HECS/HELP has no Needs Analysis field — do not map, but flag it.
    if (a.has_hecs || a.hecs_balance != null) {
      notes.push(
        `Applicant ${i + 1}: Fact Find records a HECS/HELP debt (${money(a.hecs_balance)}) — the Needs Analysis has no field for it; capture under liabilities/expenses if relevant.`,
      );
    }
  });

  /* ── Dependents (household total → applicant 1) ───────────────────────── */
  const dependents = ff.financials.servicing.dependents;
  if (dependents != null) {
    data.applicants[0].dependents_count = dependents;
    notes.push(
      `Dependents: the Fact Find records a household total (${dependents}); assigned to Applicant 1 — reallocate per applicant if needed.`,
    );
  }

  /* ── Assets ───────────────────────────────────────────────────────────── */
  const ownerDefault = twoApplicants ? "both" : "app1";
  const mappedAssets = ff.financials.assets
    .filter((a) => a.value != null || a.label.trim())
    .map((a, i) => {
      const { type, note } = mapAssetType(a.kind);
      if (note) {
        notes.push(`Asset "${a.label.trim() || a.kind}" (${a.kind}): ${note}.`);
      }
      const row = emptyNaAsset(type, i);
      row.description = a.label.trim();
      row.estimated_value = a.value;
      row.owner = ownerDefault;
      return row;
    });
  if (mappedAssets.length) {
    data.assets = mappedAssets;
    notes.push(`Asset ownership defaulted to "${ownerDefault}" — confirm ownership per asset.`);
  }

  /* ── Liabilities ──────────────────────────────────────────────────────── */
  const mappedLiabilities = ff.financials.liabilities
    .filter((l) => l.balance != null || l.monthly != null || l.label.trim())
    .map((l, i) => {
      const { type, note } = mapLiabilityType(l.kind);
      if (note) {
        notes.push(`Liability "${l.label.trim() || l.kind}" (${l.kind}): ${note}.`);
      }
      const row = emptyNaLiability(type, i);
      row.loan_provider = l.label.trim();
      row.repayments = l.monthly;
      // For a credit card the Fact Find's "balance" column is the credit LIMIT,
      // not an outstanding balance — carry it to loan_limit, leave balance blank.
      if (l.kind === "Credit card") {
        row.loan_limit = l.balance;
        if (l.balance != null) {
          notes.push(
            `Liability "${l.label.trim() || "Credit card"}": Fact Find value treated as the card LIMIT (${money(l.balance)}), not a balance — enter the outstanding balance.`,
          );
        }
      } else {
        row.loan_balance = l.balance;
      }
      row.owner = ownerDefault;
      return row;
    });
  if (mappedLiabilities.length) {
    data.liabilities = mappedLiabilities;
    notes.push(`Liability ownership defaulted to "${ownerDefault}" — confirm ownership per liability.`);
  }

  /* ── Living expenses (single total → itemised) ────────────────────────── */
  // The Fact Find has one monthly total; the Needs Analysis is itemised. Never
  // fabricate a category breakdown — leave the itemised rows blank and flag it.
  const livingTotal = ff.financials.servicing.monthly_living_expenses;
  if (livingTotal != null) {
    notes.push(
      `Fact Find recorded a single monthly living-expenses total of ${money(livingTotal)} — itemise across the categories on this form.`,
    );
  }

  return { data, notes };
}
