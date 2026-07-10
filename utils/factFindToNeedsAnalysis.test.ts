import { describe, it, expect } from "vitest";
import { emptyFactFind, type FactFindData } from "./factfind";
import { factFindToNeedsAnalysis } from "./factFindToNeedsAnalysis";
import { hydrateNeedsAnalysis } from "./needsAnalysis";

/** A richly-populated Fact Find covering every mapping branch. */
function populatedFactFind(): FactFindData {
  const ff = emptyFactFind();

  ff.loan.amount_required = 550_000;
  ff.loan.purpose = "Purchase owner-occupied home and consolidate a car loan.";

  ff.applicants[0] = {
    ...ff.applicants[0],
    title: "Mr",
    family_name: "Smith",
    given_names: "John",
    date_of_birth: "1980-04-01",
    email: "john@example.com",
    phone_home: "07 1234 5678",
    phone_work: "07 8765 4321",
    drivers_licence: "DL123456",
    occupation: "Engineer",
    address: "12 Example St, Sampleville QLD",
    postcode: "4000",
    annual_income: 120_000,
    has_hecs: true,
    hecs_balance: 17_321, // distinctive: must not surface anywhere in the seeded data
  };
  ff.applicants[1] = {
    ...ff.applicants[1],
    family_name: "Smith",
    given_names: "Jane",
    annual_income: 90_000,
  };

  ff.financials.servicing.dependents = 2;
  ff.financials.servicing.monthly_living_expenses = 4_200;

  // Assets: keep one of each meaningful kind + one entirely-empty row.
  ff.financials.assets = [
    { id: "a0", kind: "Property", label: "34 Home Rd", value: 800_000 },
    { id: "a1", kind: "Cash at bank", label: "Everyday account", value: 25_000 },
    { id: "a2", kind: "Motor vehicle", label: "2019 Toyota", value: 22_000 },
    { id: "a3", kind: "Personal effects", label: "Furniture", value: 10_000 },
    { id: "a4", kind: "Superannuation", label: "AusSuper", value: 150_000 },
    { id: "a5", kind: "Shares and investments", label: "ETFs", value: 40_000 },
    { id: "a6", kind: "Property", label: "", value: null }, // empty — skipped
  ];

  ff.financials.liabilities = [
    { id: "l0", kind: "Mortgage", label: "CBA", balance: 400_000, monthly: 2_500 },
    { id: "l1", kind: "Car lease", label: "Toyota Finance", balance: 18_000, monthly: 600 },
    { id: "l2", kind: "Credit card", label: "Amex", balance: 20_000, monthly: 500 },
    { id: "l3", kind: "Overdraft", label: "NAB overdraft", balance: 5_000, monthly: 100 },
    { id: "l4", kind: "Credit card", label: "", balance: null, monthly: null }, // empty — skipped
  ];

  return ff;
}

describe("factFindToNeedsAnalysis", () => {
  it("maps loan basics and applicant identity into the right Needs Analysis fields", () => {
    const { data } = factFindToNeedsAnalysis(populatedFactFind());

    expect(data.loan_amount_sought).toBe(550_000);
    expect(data.needs_objectives).toBe("Purchase owner-occupied home and consolidate a car loan.");

    const a0 = data.applicants[0];
    expect(a0.title).toBe("Mr");
    expect(a0.surname).toBe("Smith");
    expect(a0.given_names).toBe("John");
    expect(a0.dob).toBe("1980-04-01");
    expect(a0.contact.email).toBe("john@example.com");
    expect(a0.contact.home_phone).toBe("07 1234 5678");
    expect(a0.contact.work_phone).toBe("07 8765 4321");
    expect(a0.additional.id_document).toBe("DL123456");
    expect(a0.current_employment.occupation).toBe("Engineer");
    // Address carried into street; postcode split; suburb/state left blank.
    expect(a0.current_address.street).toBe("12 Example St, Sampleville QLD");
    expect(a0.current_address.postcode).toBe("4000");
    expect(a0.current_address.suburb).toBe("");
    expect(a0.current_address.state).toBe("");
  });

  it("carries income as gross annual (pa) with a note", () => {
    const { data, notes } = factFindToNeedsAnalysis(populatedFactFind());
    const emp = data.applicants[0].current_employment;
    expect(emp.income_amount).toBe(120_000);
    expect(emp.income_gross_or_net).toBe("gross");
    expect(emp.pay_frequency).toBe("pa");
    expect(notes.some((n) => /gross annual/i.test(n))).toBe(true);
  });

  it("does NOT map HECS/HELP but records a note when present", () => {
    const { data, notes } = factFindToNeedsAnalysis(populatedFactFind());
    // No NA field exists — nothing fabricated anywhere.
    const serialised = JSON.stringify(data);
    expect(serialised).not.toContain("17321");
    expect(notes.some((n) => /HECS\/HELP/i.test(n))).toBe(true);
  });

  it("assigns the household dependents total to applicant 1 with a note", () => {
    const { data, notes } = factFindToNeedsAnalysis(populatedFactFind());
    expect(data.applicants[0].dependents_count).toBe(2);
    expect(data.applicants[1].dependents_count).toBeNull();
    expect(notes.some((n) => /household total/i.test(n))).toBe(true);
  });

  it("maps assets, skips empty rows, and defaults owner to 'both' for two applicants", () => {
    const { data } = factFindToNeedsAnalysis(populatedFactFind());
    // 6 populated rows, the empty 7th is skipped.
    expect(data.assets).toHaveLength(6);

    const byDesc = Object.fromEntries(data.assets.map((a) => [a.description, a]));
    expect(byDesc["34 Home Rd"].type).toBe("Principal Home");
    expect(byDesc["34 Home Rd"].estimated_value).toBe(800_000);
    expect(byDesc["Everyday account"].type).toBe("Savings Account");
    expect(byDesc["2019 Toyota"].type).toBe("Motor Vehicle");
    expect(byDesc["Furniture"].type).toBe("Home Contents");
    expect(byDesc["AusSuper"].type).toBe("Superannuation");
    expect(byDesc["ETFs"].type).toBe("Other");

    // Two named applicants → 'both'.
    expect(data.assets.every((a) => a.owner === "both")).toBe(true);
  });

  it("maps an ambiguous 'Property' asset to 'Principal Home' WITH a note", () => {
    const { data, notes } = factFindToNeedsAnalysis(populatedFactFind());
    expect(data.assets[0].type).toBe("Principal Home");
    expect(notes.some((n) => /investment property/i.test(n))).toBe(true);
  });

  it("maps liabilities and skips empty rows", () => {
    const { data } = factFindToNeedsAnalysis(populatedFactFind());
    // 4 populated rows, the empty 5th is skipped.
    expect(data.liabilities).toHaveLength(4);
    const byProvider = Object.fromEntries(data.liabilities.map((l) => [l.loan_provider, l]));
    expect(byProvider["CBA"].type).toBe("Home Loan");
    expect(byProvider["CBA"].loan_balance).toBe(400_000);
    expect(byProvider["CBA"].repayments).toBe(2_500);
    expect(byProvider["Toyota Finance"].type).toBe("Car Loan");
    expect(byProvider["NAB overdraft"].type).toBe("Other");
  });

  it("puts a credit card's value in loan_limit, not loan_balance", () => {
    const { data, notes } = factFindToNeedsAnalysis(populatedFactFind());
    const cc = data.liabilities.find((l) => l.loan_provider === "Amex")!;
    expect(cc.type).toBe("Credit Card");
    expect(cc.loan_limit).toBe(20_000);
    expect(cc.loan_balance).toBeNull();
    expect(notes.some((n) => /LIMIT/i.test(n))).toBe(true);
  });

  it("never fabricates a living-expenses breakdown — total becomes a note, rows stay blank", () => {
    const { data, notes } = factFindToNeedsAnalysis(populatedFactFind());
    expect(data.living_expenses.every((e) => e.amount === null)).toBe(true);
    expect(notes.some((n) => /living-expenses total/i.test(n) && n.includes("4,200"))).toBe(true);
  });

  it("populates notes for the known assumptions", () => {
    const { notes } = factFindToNeedsAnalysis(populatedFactFind());
    expect(notes.length).toBeGreaterThan(0);
    // Every note is a non-empty human-readable string.
    expect(notes.every((n) => typeof n === "string" && n.trim().length > 0)).toBe(true);
  });

  it("defaults owner to 'app1' when only one applicant is named", () => {
    const ff = populatedFactFind();
    ff.applicants[1] = { ...emptyFactFind().applicants[1] }; // blank second applicant
    const { data } = factFindToNeedsAnalysis(ff);
    expect(data.assets.every((a) => a.owner === "app1")).toBe(true);
    expect(data.liabilities.every((l) => l.owner === "app1")).toBe(true);
  });

  it("produces a result that validates/round-trips through the Needs Analysis shape", () => {
    const { data } = factFindToNeedsAnalysis(populatedFactFind());
    // hydrate is the server's normaliser — a clean seed must survive it unchanged
    // in the fields we set (no undefined where the form expects a value).
    const hydrated = hydrateNeedsAnalysis(data);
    expect(hydrated.loan_amount_sought).toBe(550_000);
    expect(hydrated.applicants[0].surname).toBe("Smith");
    expect(hydrated.assets).toHaveLength(6);
    expect(hydrated.liabilities).toHaveLength(4);
    expect(hydrated.living_expenses).toHaveLength(20); // fixed template rows preserved
    // No field we set is undefined.
    for (const a of hydrated.assets) {
      expect(a.type).toBeDefined();
      expect(a.owner).toBeDefined();
      expect(a.estimated_value !== undefined).toBe(true);
    }
  });

  it("returns an empty-ish seed with no crash for a blank Fact Find", () => {
    const { data, notes } = factFindToNeedsAnalysis(emptyFactFind());
    expect(data.loan_amount_sought).toBeNull();
    expect(data.needs_objectives).toBe("");
    // Blank Fact Find has all-empty asset/liability rows → nothing mapped,
    // defaults preserved.
    expect(notes).toEqual([]);
  });
});
