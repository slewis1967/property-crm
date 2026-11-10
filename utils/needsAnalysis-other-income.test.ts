import { describe, it, expect } from "vitest";
import {
  computeNeedsAnalysisTotals,
  emptyNeedsAnalysis,
  emptyOtherIncome,
  hydrateNeedsAnalysis,
  monthlyOtherIncomeFor,
  type NeedsAnalysisData,
} from "./needsAnalysis";
import { needsAnalysisToDeclaredIncome } from "./income-reconciliation-run";

/**
 * Other income, per applicant, as rows.
 *
 * The paper form carried one free-text line for the whole household. Two things
 * followed, and both are pinned here:
 *
 *   1. NOBODY KNEW WHOSE IT WAS. The reconciliation guessed by scanning the
 *      prose for an applicant's first name and defaulting to applicant 1. On a
 *      document the client signs, guessing whose money it is is not acceptable.
 *   2. IT WAS NOT A NUMBER, so nothing could total it or compare it to a
 *      payslip — which is why an unevidenced claim went unchallenged.
 *
 * The legacy line is deliberately NOT parsed into rows. A test below fixes that,
 * because "helpfully" splitting a sentence into an amount and an owner would
 * reintroduce exactly the guessing this removed.
 */

function withRows(rows: Partial<ReturnType<typeof emptyOtherIncome>>[]): NeedsAnalysisData {
  const d = emptyNeedsAnalysis();
  d.applicants[0].given_names = "David";
  d.applicants[0].surname = "Halliday";
  d.applicants[1].given_names = "Jane";
  d.applicants[1].surname = "Halliday";
  d.other_incomes = rows.map((r, i) => ({ ...emptyOtherIncome("Other", i), ...r }));
  return d;
}

describe("monthlyOtherIncomeFor", () => {
  it("gives an applicant only their own rows", () => {
    const d = withRows([
      { amount: 400, frequency: "wk", owner: "app1" },
      { amount: 200, frequency: "wk", owner: "app2" },
    ]);
    // 400/wk = 400 * 52 / 12
    expect(Math.round(monthlyOtherIncomeFor(d, "app1"))).toBe(1733);
    expect(Math.round(monthlyOtherIncomeFor(d, "app2"))).toBe(867);
  });

  it("counts a jointly-received payment for either applicant", () => {
    const d = withRows([{ amount: 600, frequency: "m", owner: "both" }]);
    expect(monthlyOtherIncomeFor(d, "app1")).toBe(600);
    expect(monthlyOtherIncomeFor(d, "app2")).toBe(600);
  });

  /**
   * An unowned row belongs to nobody. Silently handing it to applicant 1 is the
   * behaviour this change removed — leaving it out of the per-applicant figure
   * makes the omission visible and correctable.
   */
  it("gives an unattributed row to neither applicant", () => {
    const d = withRows([{ amount: 500, frequency: "m", owner: "" }]);
    expect(monthlyOtherIncomeFor(d, "app1")).toBe(0);
    expect(monthlyOtherIncomeFor(d, "app2")).toBe(0);
  });

  it("converts every frequency to a month", () => {
    const d = withRows([
      { amount: 120, frequency: "fn", owner: "app1" },
      { amount: 1200, frequency: "pa", owner: "app1" },
      { amount: 50, frequency: "m", owner: "app1" },
    ]);
    // 120/fn = 260/mo, 1200/pa = 100/mo, 50/mo = 50
    expect(Math.round(monthlyOtherIncomeFor(d, "app1"))).toBe(410);
  });
});

describe("computeNeedsAnalysisTotals", () => {
  it("totals other income across the household", () => {
    const d = withRows([
      { amount: 400, frequency: "wk", owner: "app1" },
      { amount: 600, frequency: "m", owner: "app2" },
    ]);
    expect(Math.round(computeNeedsAnalysisTotals(d).monthlyOtherIncome)).toBe(2333);
  });

  it("is zero when there is none, rather than undefined", () => {
    expect(computeNeedsAnalysisTotals(emptyNeedsAnalysis()).monthlyOtherIncome).toBe(0);
  });
});

describe("hydrateNeedsAnalysis and the legacy line", () => {
  /**
   * Documents signed before the rows existed hold their only record of a
   * client's extra income in the free-text line. Dropping the field would
   * silently delete it from a document that has already been relied on.
   */
  it("keeps a legacy other_income sentence", () => {
    const d = hydrateNeedsAnalysis({ other_income: "David casual Woolworths 1 day per $400 per week" });
    expect(d.other_income).toBe("David casual Woolworths 1 day per $400 per week");
  });

  /** And does NOT invent rows from it — that is the guessing this removed. */
  it("does not parse the legacy sentence into rows", () => {
    const d = hydrateNeedsAnalysis({ other_income: "David casual Woolworths $400 per week" });
    expect(d.other_incomes).toEqual([]);
  });

  it("carries rows through, filling any field an older blob lacked", () => {
    const d = hydrateNeedsAnalysis({
      other_incomes: [{ id: "x", type: "Commission", amount: 900 }],
    });
    expect(d.other_incomes).toHaveLength(1);
    expect(d.other_incomes[0].type).toBe("Commission");
    expect(d.other_incomes[0].amount).toBe(900);
    // Defaulted, not undefined — the form binds to these.
    expect(d.other_incomes[0].frequency).toBe("m");
    expect(d.other_incomes[0].owner).toBe("");
    expect(d.other_incomes[0].description).toBe("");
  });

  it("treats a blob with neither field as having no other income", () => {
    const d = hydrateNeedsAnalysis({});
    expect(d.other_incomes).toEqual([]);
    expect(d.other_income).toBe("");
  });
});

describe("needsAnalysisToDeclaredIncome and other income", () => {
  it("attributes a row to the applicant who owns it, not by name-guessing", () => {
    const d = withRows([
      { type: "Second job", description: "Woolworths", amount: 400, frequency: "wk", owner: "app2" },
    ]);
    const declared = needsAnalysisToDeclaredIncome(d);
    expect(declared[0].otherIncomeNote).toBeNull();
    expect(declared[1].otherIncomeNote).toContain("Second job");
    expect(declared[1].otherIncomeNote).toContain("Woolworths");
  });

  it("gives a joint row to both applicants", () => {
    const d = withRows([{ type: "Centrelink / Family Assistance", amount: 300, frequency: "fn", owner: "both" }]);
    const declared = needsAnalysisToDeclaredIncome(d);
    expect(declared[0].otherIncomeNote).toContain("Centrelink");
    expect(declared[1].otherIncomeNote).toContain("Centrelink");
  });

  /**
   * An unattributed row must still reach the reconciliation. Dropping it would
   * hide a declared income from the check that exists to notice exactly that.
   */
  it("surfaces an unattributed row, and says it is unattributed", () => {
    const d = withRows([{ type: "Bonus", amount: 5000, frequency: "pa", owner: "" }]);
    const declared = needsAnalysisToDeclaredIncome(d);
    expect(declared[0].otherIncomeNote).toContain("Bonus");
    expect(declared[0].otherIncomeNote).toContain("not attributed");
  });

  it("says so when an amount was left blank", () => {
    const d = withRows([{ type: "Commission", amount: null, owner: "app1" }]);
    expect(needsAnalysisToDeclaredIncome(d)[0].otherIncomeNote).toContain("amount not stated");
  });

  it("joins several rows for the same applicant rather than keeping only the last", () => {
    const d = withRows([
      { type: "Bonus", amount: 2000, frequency: "pa", owner: "app1" },
      { type: "Rental income", amount: 500, frequency: "fn", owner: "app1" },
    ]);
    const note = needsAnalysisToDeclaredIncome(d)[0].otherIncomeNote ?? "";
    expect(note).toContain("Bonus");
    expect(note).toContain("Rental income");
  });

  it("still carries a legacy sentence, marked as a note", () => {
    const d = withRows([]);
    d.other_income = "David casual Woolworths $400/wk";
    const declared = needsAnalysisToDeclaredIncome(d);
    expect(declared[0].otherIncomeNote).toContain("Recorded as a note");
    expect(declared[0].otherIncomeNote).toContain("Woolworths");
  });
});
