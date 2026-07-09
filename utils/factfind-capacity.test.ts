import { describe, expect, it } from "vitest";
import { emptyFactFind, hydrateFactFind, type FactFindData } from "./factfind";
import {
  ASSUMED_MORTGAGE_RATE,
  capacityIsMeaningful,
  factFindToCapacityInputs,
  stateFromPostcode,
} from "./factfind-capacity";
import { computeCapacity, CURRENT_TAX_YEAR, TAX_YEARS } from "./finance";

/** A fact find filled in enough to service. */
function filled(): FactFindData {
  const d = emptyFactFind();
  d.applicants[0] = { ...d.applicants[0], family_name: "Smith", annual_income: 120000 };
  d.financials.servicing = { dependents: 0, monthly_living_expenses: 3000 };
  // Assets: $150k cash
  const cash = d.financials.assets.find((a) => a.kind === "Cash at bank")!;
  cash.value = 150000;
  return d;
}

/** Set the nth liability of a given kind. */
function setLiab(d: FactFindData, kind: string, i: number, balance: number | null, monthly: number | null) {
  const rows = d.financials.liabilities.filter((l) => l.kind === kind);
  rows[i].balance = balance;
  rows[i].monthly = monthly;
}

describe("stateFromPostcode", () => {
  it("maps the mainland ranges", () => {
    expect(stateFromPostcode("2000")).toBe("NSW");
    expect(stateFromPostcode("3000")).toBe("VIC");
    expect(stateFromPostcode("4000")).toBe("QLD");
    expect(stateFromPostcode("5000")).toBe("SA");
    expect(stateFromPostcode("6000")).toBe("WA");
    expect(stateFromPostcode("7000")).toBe("TAS");
    expect(stateFromPostcode("0800")).toBe("NT");
  });

  it("picks ACT out of the NSW range", () => {
    expect(stateFromPostcode("2600")).toBe("ACT");
    expect(stateFromPostcode("2911")).toBe("ACT");
    expect(stateFromPostcode("2650")).toBe("NSW"); // Wagga, inside the ACT gap
    expect(stateFromPostcode("2999")).toBe("NSW");
  });

  it("returns null for junk", () => {
    expect(stateFromPostcode("")).toBeNull();
    expect(stateFromPostcode("abcd")).toBeNull();
    expect(stateFromPostcode("9999")).toBeNull();
  });
});

describe("factFindToCapacityInputs", () => {
  it("reports an empty fact find as missing income, and refuses to call it meaningful", () => {
    const { missing } = factFindToCapacityInputs(emptyFactFind());
    expect(missing).toContain("applicant_income");
    expect(capacityIsMeaningful(missing)).toBe(false);
  });

  it("maps a filled fact find into servicing inputs", () => {
    const { inputs, missing } = factFindToCapacityInputs(filled());
    expect(inputs.income).toBe(120000);
    expect(inputs.deposit).toBe(150000);
    expect(inputs.declaredExpenses).toBe(3000);
    expect(missing).not.toContain("applicant_income");
    expect(capacityIsMeaningful(missing)).toBe(true);
  });

  it("treats applicant 2 as the partner", () => {
    const d = filled();
    d.applicants[1] = { ...d.applicants[1], annual_income: 90000, has_hecs: true, hecs_balance: 20000 };
    const { inputs } = factFindToCapacityInputs(d);
    expect(inputs.partner).toBe(90000);
    expect(inputs.partnerHasHecs).toBe(true);
    expect(inputs.partnerHecsBalance).toBe(20000);
  });

  it("reads a credit card's balance as its LIMIT, per the form", () => {
    const d = filled();
    setLiab(d, "Credit card", 0, 25000, 500);
    const { inputs } = factFindToCapacityInputs(d);
    expect(inputs.creditLimit).toBe(25000);
    // and the engine assesses the limit at 3.8%/mo, not the $500 stated monthly
    expect(computeCapacity(inputs).consumerDebtCommit).toBeCloseTo(25000 * 0.038, 5);
  });

  it("routes car lease and other loans to servicing AND their balances to DTI", () => {
    const d = filled();
    setLiab(d, "Car lease", 0, 30000, 700);
    setLiab(d, "Other loan", 0, 15000, 400);
    setLiab(d, "Overdraft", 0, 5000, 100);
    const { inputs } = factFindToCapacityInputs(d);
    expect(inputs.carLoan).toBe(700);
    expect(inputs.otherDebts).toBe(500); // other loan + overdraft
    expect(inputs.consumerDebtBalance).toBe(50000);
  });

  it("ignores blank security template rows", () => {
    const { inputs } = factFindToCapacityInputs(filled());
    expect(inputs.properties).toHaveLength(0);
  });

  it("maps an owned investment security to a grandfathered property", () => {
    const d = filled();
    d.securities[0] = {
      ...d.securities[0],
      address: "12 Example St",
      postcode: "4000",
      ownership: "Already owned",
      use: "Investment property",
      estimated_value: 750000,
      rental_per_week: 550,
    };
    setLiab(d, "Mortgage", 0, 400000, 2500);

    const { inputs } = factFindToCapacityInputs(d);
    expect(inputs.properties).toHaveLength(1);
    const p = inputs.properties[0];
    expect(p.label).toBe("12 Example St");
    expect(p.use).toBe("investment");
    expect(p.value).toBe(750000);
    expect(p.weeklyRent).toBe(550);
    expect(p.loanBalance).toBe(400000); // paired positionally
    expect(p.rate).toBe(ASSUMED_MORTGAGE_RATE);
    expect(p.heldBeforeNgCutoff).toBe(true); // already owned → grandfathered
  });

  it("gives an owner-occupied security no rent", () => {
    const d = filled();
    d.securities[0] = {
      ...d.securities[0],
      address: "1 Home Ave",
      ownership: "Already owned",
      use: "Owner occupied",
      estimated_value: 900000,
      rental_per_week: 600, // nonsense on an owner-occupied row; must be ignored
    };
    const { inputs } = factFindToCapacityInputs(d);
    expect(inputs.properties[0].use).toBe("owner_occupied");
    expect(inputs.properties[0].weeklyRent).toBe(0);
  });

  it("prices the purchase security and derives the state from its postcode", () => {
    const d = filled();
    d.securities[0] = {
      ...d.securities[0],
      address: "9 New Rd",
      postcode: "3000",
      ownership: "Being purchased",
      use: "Investment property",
      estimated_value: 700000,
      rental_per_week: 600,
    };
    const { inputs, missing } = factFindToCapacityInputs(d);
    expect(inputs.state).toBe("VIC");
    expect(inputs.newWeeklyRent).toBe(600);
    expect(inputs.properties).toHaveLength(0); // a purchase is not an existing property
    expect(missing).not.toContain("purchase_state");
  });

  it("defaults the state to QLD and says so when the postcode is unusable", () => {
    const d = filled();
    d.securities[0] = { ...d.securities[0], address: "9 New Rd", postcode: "", ownership: "Being purchased" };
    const { inputs, missing } = factFindToCapacityInputs(d);
    expect(inputs.state).toBe("QLD");
    expect(missing).toContain("purchase_state");
  });

  it("degrades conservatively when mortgages outnumber owned securities", () => {
    const d = filled();
    d.securities[0] = {
      ...d.securities[0],
      address: "A",
      ownership: "Already owned",
      use: "Investment property",
      estimated_value: 600000,
      rental_per_week: 500,
    };
    setLiab(d, "Mortgage", 0, 400000, 2500);
    setLiab(d, "Mortgage", 1, 300000, 1800); // no security to attach to

    const { inputs, notes } = factFindToCapacityInputs(d);
    expect(inputs.properties).toHaveLength(1);
    expect(inputs.properties[0].loanBalance).toBe(400000);
    // The orphan mortgage still hits servicing and DTI — nothing vanishes.
    expect(inputs.otherDebts).toBe(1800);
    expect(inputs.consumerDebtBalance).toBe(300000);
    expect(notes.some((x) => x.includes("could not be matched"))).toBe(true);
  });

  it("never invents a property for an orphan mortgage (would fake a gearing benefit)", () => {
    const d = filled();
    setLiab(d, "Mortgage", 0, 500000, 3000);
    const { inputs } = factFindToCapacityInputs(d);
    expect(inputs.properties).toHaveLength(0);
    expect(computeCapacity(inputs).deductibleLoss).toBe(0);
  });

  it("uses the requested loan term when given", () => {
    const d = filled();
    d.loan.term_months = 240;
    expect(factFindToCapacityInputs(d).inputs.loanTerm).toBe(20);
  });

  it("falls back to a 30-year term when the fact find omits it", () => {
    expect(factFindToCapacityInputs(filled()).inputs.loanTerm).toBe(30);
  });

  it("honours overrides so the advisor can tune rate and buffer", () => {
    const { inputs } = factFindToCapacityInputs(filled(), { rate: 5.75, dtiCap: 7, taxYear: "2027-28" });
    expect(inputs.rate).toBe(5.75);
    expect(inputs.dtiCap).toBe(7);
    expect(inputs.taxYear).toBe("2027-28");
  });

  it("produces inputs the engine actually accepts, end to end", () => {
    const d = filled();
    d.securities[0] = {
      ...d.securities[0],
      address: "12 Example St",
      postcode: "4000",
      ownership: "Already owned",
      use: "Investment property",
      estimated_value: 750000,
      rental_per_week: 550,
    };
    setLiab(d, "Mortgage", 0, 400000, 2500);
    setLiab(d, "Credit card", 0, 20000, null);

    const { inputs } = factFindToCapacityInputs(d);
    const r = computeCapacity(inputs);
    expect(r.converged).toBe(true);
    expect(r.maxLoan).toBeGreaterThan(0);
    expect(r.portfolioDebt).toBe(400000);
    expect(r.purchasePrice).toBeGreaterThan(0);
  });

  it("keeps a stale saved blob working — hydrate backfills the new fields", () => {
    // A row persisted before `servicing` / `annual_income` existed. This is the
    // real path: the API hands a raw blob to hydrateFactFind before anything
    // else touches it.
    const legacy = emptyFactFind() as Record<string, unknown>;
    const financials = { ...(legacy.financials as Record<string, unknown>) };
    delete financials.servicing;
    legacy.financials = financials;
    (legacy.applicants as Record<string, unknown>[]).forEach((a) => {
      delete a.annual_income;
      delete a.has_hecs;
      delete a.hecs_balance;
    });

    const hydrated = hydrateFactFind(legacy);
    expect(hydrated.financials.servicing).toEqual({ dependents: null, monthly_living_expenses: null });
    expect(hydrated.applicants[0].annual_income).toBeNull();
    expect(hydrated.applicants[0].has_hecs).toBe(false);

    const { inputs, missing } = factFindToCapacityInputs(hydrated);
    expect(inputs.dependents).toBe(0);
    expect(inputs.hasHecs).toBe(false);
    expect(missing).toContain("applicant_income");
    expect(missing).toContain("dependents");
  });
});

describe("taxYear override", () => {
  it("defaults to the current tax year", () => {
    expect(factFindToCapacityInputs(filled()).inputs.taxYear).toBe(CURRENT_TAX_YEAR);
  });

  it("passes an overridden year through to the engine", () => {
    // Backs the CapacityPanel assessment-year selector. If overrides stopped
    // reaching `inputs`, the selector would silently be decorative.
    for (const y of TAX_YEARS) {
      expect(factFindToCapacityInputs(filled(), { taxYear: y }).inputs.taxYear).toBe(y);
    }
  });

  it("changes the answer for an established dwelling in 2027-28", () => {
    // Negative gearing is limited to new builds from 1 Jul 2027, so an
    // established-dwelling purchase services differently across the cutover.
    const d = filled();
    const before = computeCapacity(factFindToCapacityInputs(d, { taxYear: "2026-27" }).inputs);
    const after = computeCapacity(factFindToCapacityInputs(d, { taxYear: "2027-28" }).inputs);
    expect(before.maxLoan).toBeGreaterThan(0);
    expect(after.maxLoan).toBeGreaterThan(0);
    expect(after.maxLoan).not.toBe(before.maxLoan);
  });
});
