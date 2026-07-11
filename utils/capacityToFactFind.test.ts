import { describe, expect, it } from "vitest";
import { emptyFactFind, type FactFindData } from "./factfind";
import { factFindToCapacityInputs } from "./factfind-capacity";
import { capacityInputsToFactFind } from "./capacityToFactFind";

/**
 * A fact find filled in enough to service AND to exercise every overlapping
 * financial field: income + partner, dependents, living expenses, one owned
 * security with a paired mortgage, and a credit-card limit — PLUS disclosed
 * financial rows the calculator doesn't model (cash, super, a motor vehicle,
 * an overdraft) so the merge's data-preservation can be asserted.
 */
function filled(): FactFindData {
  const d = emptyFactFind();

  // Identity / disclosures / declarations we expect the overlay to preserve.
  d.applicants[0] = {
    ...d.applicants[0],
    family_name: "Smith",
    given_names: "John",
    date_of_birth: "1985-06-01",
    annual_income: 120000,
    has_hecs: true,
    hecs_balance: 15000,
  };
  d.applicants[1] = { ...d.applicants[1], family_name: "Smith", given_names: "Jane", annual_income: 60000 };
  d.disclosures.bankruptcy = { answer: "no", details: "n/a" };
  d.declarations.info_confirmed = true;
  d.declarations.signatories[0] = { name: "John Smith", date: "2026-07-01" };
  d.referred_by = "Broker X";

  // Servicing.
  d.financials.servicing = { dependents: 2, monthly_living_expenses: 3200 };

  // One owned investment security + its mortgage → a portfolio property.
  d.securities[0] = {
    ...d.securities[0],
    address: "1 Test St",
    suburb: "Brisbane",
    postcode: "4000",
    use: "Investment property",
    ownership: "Already owned",
    estimated_value: 650000,
    rental_per_week: 550,
  };
  const mortgage = d.financials.liabilities.find((l) => l.kind === "Mortgage")!;
  mortgage.balance = 400000;
  mortgage.monthly = 2500;

  // Credit-card limit lives in the balance column, per the form.
  const card = d.financials.liabilities.find((l) => l.kind === "Credit card")!;
  card.balance = 12000;

  // An overdraft the calculator doesn't own — must survive a Save.
  const overdraft = d.financials.liabilities.find((l) => l.kind === "Overdraft")!;
  overdraft.balance = 5000;
  overdraft.monthly = 100;

  // Assets the calculator doesn't model — must survive a Save.
  d.financials.assets.find((a) => a.kind === "Cash at bank")!.value = 90000;
  d.financials.assets.find((a) => a.kind === "Superannuation")!.value = 85000;
  d.financials.assets.find((a) => a.kind === "Motor vehicle")!.value = 25000;

  return d;
}

describe("capacityInputsToFactFind", () => {
  it("overlays financials without touching identity / disclosures / declarations / securities", () => {
    const base = filled();
    const { inputs } = factFindToCapacityInputs(base);
    const { data } = capacityInputsToFactFind(inputs, base);

    // Identity survives.
    expect(data.applicants[0].family_name).toBe("Smith");
    expect(data.applicants[0].given_names).toBe("John");
    expect(data.applicants[0].date_of_birth).toBe("1985-06-01");
    expect(data.referred_by).toBe("Broker X");

    // Disclosures + declarations survive verbatim.
    expect(data.disclosures.bankruptcy).toEqual({ answer: "no", details: "n/a" });
    expect(data.declarations.info_confirmed).toBe(true);
    expect(data.declarations.signatories[0]).toEqual({ name: "John Smith", date: "2026-07-01" });

    // Securities are not this direction's business — untouched.
    expect(data.securities).toEqual(base.securities);

    // The source fact find is not mutated.
    expect(base.financials.assets.find((a) => a.kind === "Cash at bank")!.value).toBe(90000);
  });

  it("DATA-LOSS GUARD: preserves assets/liabilities the calculator doesn't model", () => {
    // Regression guard for the old "rebuild the tables" behaviour, which dropped
    // every non-Property asset and non-Mortgage/Card liability on a Save.
    const base = filled();
    const { inputs } = factFindToCapacityInputs(base);
    const { data } = capacityInputsToFactFind(inputs, base);

    const cash = data.financials.assets.filter((a) => a.kind === "Cash at bank");
    const super_ = data.financials.assets.filter((a) => a.kind === "Superannuation");
    const vehicle = data.financials.assets.filter((a) => a.kind === "Motor vehicle");
    const overdraft = data.financials.liabilities.filter((l) => l.kind === "Overdraft");

    expect(cash).toHaveLength(1);
    expect(cash[0].value).toBe(90000);
    expect(super_).toHaveLength(1);
    expect(super_[0].value).toBe(85000);
    expect(vehicle).toHaveLength(1);
    expect(vehicle[0].value).toBe(25000);
    expect(overdraft).toHaveLength(1);
    expect(overdraft[0].balance).toBe(5000);
    expect(overdraft[0].monthly).toBe(100);
  });

  it("replaces ONLY the Property assets and Mortgage/Credit-card liabilities", () => {
    const base = filled();
    const { inputs } = factFindToCapacityInputs(base);
    const { data } = capacityInputsToFactFind(inputs, base);

    expect(data.applicants[0].annual_income).toBe(120000);
    expect(data.applicants[0].has_hecs).toBe(true);
    expect(data.applicants[0].hecs_balance).toBe(15000);
    expect(data.applicants[1].annual_income).toBe(60000);

    expect(data.financials.servicing.dependents).toBe(2);
    expect(data.financials.servicing.monthly_living_expenses).toBe(3200);

    const properties = data.financials.assets.filter((a) => a.kind === "Property");
    expect(properties).toHaveLength(1);
    expect(properties[0].value).toBe(650000);

    const mortgages = data.financials.liabilities.filter((l) => l.kind === "Mortgage");
    expect(mortgages).toHaveLength(1);
    expect(mortgages[0].balance).toBe(400000);

    const cards = data.financials.liabilities.filter((l) => l.kind === "Credit card");
    expect(cards).toHaveLength(1);
    expect(cards[0].balance).toBe(12000);
  });

  it("is idempotent — a second overlay duplicates nothing and keeps preserved rows single", () => {
    const base = filled();
    const { inputs } = factFindToCapacityInputs(base);
    const once = capacityInputsToFactFind(inputs, base).data;
    // Re-drive the calculator from the overlaid fact find, then overlay again.
    const { inputs: inputs2 } = factFindToCapacityInputs(once);
    const twice = capacityInputsToFactFind(inputs2, once).data;

    // Calculator-owned rows: exactly one each, no accumulation.
    expect(twice.financials.assets.filter((a) => a.kind === "Property")).toHaveLength(1);
    expect(twice.financials.liabilities.filter((l) => l.kind === "Mortgage")).toHaveLength(1);
    expect(twice.financials.liabilities.filter((l) => l.kind === "Credit card")).toHaveLength(1);

    // Preserved rows: still single, still intact.
    expect(twice.financials.assets.filter((a) => a.kind === "Cash at bank")).toHaveLength(1);
    expect(twice.financials.assets.filter((a) => a.kind === "Superannuation")).toHaveLength(1);
    expect(twice.financials.assets.filter((a) => a.kind === "Motor vehicle")).toHaveLength(1);
    expect(twice.financials.liabilities.filter((l) => l.kind === "Overdraft")).toHaveLength(1);
  });

  it("notes the replaced rows and the deliberately-unwritten monthly debts", () => {
    const base = filled();
    const { inputs } = factFindToCapacityInputs(base);
    const { notes } = capacityInputsToFactFind(inputs, base);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((s) => /Mortgage rows were replaced/i.test(s))).toBe(true);
    expect(notes.some((s) => /limit stored/i.test(s))).toBe(true);
    // Monthly consumer debts are explicitly NOT written back.
    expect(notes.some((s) => /not written back/i.test(s))).toBe(true);
  });
});

describe("FF → capacity → FF round-trip", () => {
  it("preserves the key overlapping numbers within tolerance", () => {
    const base = filled();
    const { inputs: cap1 } = factFindToCapacityInputs(base);
    const { data: roundTripped } = capacityInputsToFactFind(cap1, base);
    const { inputs: cap2 } = factFindToCapacityInputs(roundTripped);

    const near = (a: number, b: number, tol = 1) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

    near(cap2.income, cap1.income);
    near(cap2.partner, cap1.partner);
    near(cap2.dependents, cap1.dependents);
    near(cap2.declaredExpenses, cap1.declaredExpenses);
    near(cap2.creditLimit, cap1.creditLimit);

    // The property value survives the round trip (security → property → asset →
    // security-driven re-read still values the same portfolio).
    near(
      cap2.properties.reduce((t, p) => t + p.value, 0),
      cap1.properties.reduce((t, p) => t + p.value, 0),
    );
    near(
      cap2.properties.reduce((t, p) => t + p.loanBalance, 0),
      cap1.properties.reduce((t, p) => t + p.loanBalance, 0),
    );
  });
});
