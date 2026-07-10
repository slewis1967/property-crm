import { describe, it, expect } from "vitest";
import {
  applicantSummary,
  computeNeedsAnalysisTotals,
  emptyNeedsAnalysis,
  formatMoney,
  hydrateNeedsAnalysis,
  needsAnalysisErrMessage,
  needsAnalysesTableMissing,
  outstandingSections,
  toMonthly,
  LIVING_EXPENSE_LABELS,
  type NeedsAnalysisData,
} from "./needsAnalysis";

/** A needs analysis with just enough filled in to be Complete. */
function completeNeedsAnalysis(): NeedsAnalysisData {
  const d = emptyNeedsAnalysis();
  d.interview_type = "face_to_face";
  d.applicants[0] = {
    ...d.applicants[0],
    surname: "Smith",
    given_names: "John",
    dob: "1980-04-01",
  };
  d.applicants[0].current_address.street = "12 Example St";
  d.needs_objectives = "Refinance to consolidate debt and free up cash flow.";
  d.loan_amount_sought = 550_000;
  return d;
}

describe("emptyNeedsAnalysis", () => {
  it("seeds two applicants, default asset/liability rows and the fixed expense rows", () => {
    const d = emptyNeedsAnalysis();
    expect(d.applicants).toHaveLength(2);
    expect(d.assets.length).toBeGreaterThan(0);
    expect(d.liabilities.length).toBeGreaterThan(0);
    expect(d.living_expenses).toHaveLength(LIVING_EXPENSE_LABELS.length);
    // Nested sub-objects exist so the form never reads a field off undefined.
    expect(d.applicants[0].current_address.tenure).toBe("");
    expect(d.applicants[0].current_employment.employer.postcode).toBe("");
    expect(d.applicants[0].previous_employment.date_finished).toBe("");
  });

  it("leaves the yes/no basics unanswered rather than defaulting to No", () => {
    const d = emptyNeedsAnalysis();
    expect(d.purchased_or_signed_cos).toBeNull();
    expect(d.first_home_buyer).toBeNull();
  });
});

describe("computeNeedsAnalysisTotals", () => {
  it("is all zeros for an empty needs analysis", () => {
    expect(computeNeedsAnalysisTotals(emptyNeedsAnalysis())).toEqual({
      totalAssets: 0,
      totalLiabilities: 0,
      monthlyLivingExpenses: 0,
    });
  });

  it("sums asset values and liability balances", () => {
    const d = emptyNeedsAnalysis();
    d.assets[0].estimated_value = 900_000; // Principal Home
    d.assets[3].estimated_value = 50_000; // Savings Account
    d.liabilities[0].loan_balance = 400_000; // Home Loan
    d.liabilities[1].loan_balance = 8_000; // Credit Card

    const t = computeNeedsAnalysisTotals(d);
    expect(t.totalAssets).toBe(950_000);
    expect(t.totalLiabilities).toBe(408_000);
  });

  it("ignores null and non-finite entries rather than producing NaN", () => {
    const d = emptyNeedsAnalysis();
    d.assets[0].estimated_value = 100;
    d.assets[1].estimated_value = null;
    d.assets[2].estimated_value = Number.NaN;
    d.liabilities[0].loan_balance = Number.POSITIVE_INFINITY;

    const t = computeNeedsAnalysisTotals(d);
    expect(t.totalAssets).toBe(100);
    expect(t.totalLiabilities).toBe(0);
  });

  it("converts each living expense to a monthly total", () => {
    const d = emptyNeedsAnalysis();
    d.living_expenses[0] = { amount: 100, frequency: "wk", description: "" }; // 100*52/12
    d.living_expenses[1] = { amount: 200, frequency: "fn", description: "" }; // 200*26/12
    d.living_expenses[2] = { amount: 300, frequency: "m", description: "" }; // 300
    d.living_expenses[3] = { amount: 1200, frequency: "pa", description: "" }; // 100

    const expected = (100 * 52) / 12 + (200 * 26) / 12 + 300 + 1200 / 12;
    expect(computeNeedsAnalysisTotals(d).monthlyLivingExpenses).toBeCloseTo(expected, 6);
  });
});

describe("toMonthly", () => {
  it("scales each frequency onto a month", () => {
    expect(toMonthly(120, "m")).toBe(120);
    expect(toMonthly(1200, "pa")).toBe(100);
    expect(toMonthly(12, "wk")).toBeCloseTo((12 * 52) / 12, 6);
    expect(toMonthly(12, "fn")).toBeCloseTo((12 * 26) / 12, 6);
  });

  it("treats an unknown frequency as monthly and null as zero", () => {
    expect(toMonthly(50, "??")).toBe(50);
    expect(toMonthly(null, "m")).toBe(0);
    expect(toMonthly(Number.NaN, "wk")).toBe(0);
  });
});

describe("formatMoney", () => {
  it("renders whole dollars with a thousands separator", () => {
    expect(formatMoney(400000).replace(/ /g, " ")).toBe("$400,000");
  });

  it("formats zero as $0, not an empty string", () => {
    expect(formatMoney(0)).toContain("0");
    expect(formatMoney(0)).not.toBe("");
  });

  it("returns an empty string for unset or non-finite values", () => {
    expect(formatMoney(null)).toBe("");
    expect(formatMoney(undefined)).toBe("");
    expect(formatMoney(Number.NaN)).toBe("");
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("applicantSummary", () => {
  it("joins both applicants and drops empty ones", () => {
    const d = emptyNeedsAnalysis();
    d.applicants[0].surname = "Smith";
    d.applicants[0].given_names = "John";
    expect(applicantSummary(d)).toBe("Smith, John");

    d.applicants[1].surname = "Smith";
    d.applicants[1].given_names = "Jane";
    expect(applicantSummary(d)).toBe("Smith, John & Smith, Jane");
  });

  it("is empty when nothing is filled in", () => {
    expect(applicantSummary(emptyNeedsAnalysis())).toBe("");
  });
});

describe("outstandingSections", () => {
  it("lists every gap on an empty form", () => {
    const missing = outstandingSections(emptyNeedsAnalysis());
    expect(missing).toContain("Interview type");
    expect(missing).toContain("Applicant 1 name");
    expect(missing).toContain("Needs & objectives");
    expect(missing).toContain("Loan amount sought");
  });

  it("is empty once the required fields are answered", () => {
    expect(outstandingSections(completeNeedsAnalysis())).toEqual([]);
  });

  it("accepts a zero loan amount as answered rather than missing", () => {
    const d = completeNeedsAnalysis();
    d.loan_amount_sought = 0;
    expect(outstandingSections(d)).toEqual([]);
  });
});

describe("hydrateNeedsAnalysis", () => {
  it("returns a clean template for junk input", () => {
    expect(hydrateNeedsAnalysis(null)).toEqual(emptyNeedsAnalysis());
    expect(hydrateNeedsAnalysis("nope")).toEqual(emptyNeedsAnalysis());
    expect(hydrateNeedsAnalysis(undefined)).toEqual(emptyNeedsAnalysis());
  });

  it("backfills sections a stored blob never had", () => {
    const partial = { location: "Brisbane office", loan_amount_sought: 500_000 };
    const d = hydrateNeedsAnalysis(partial);

    expect(d.location).toBe("Brisbane office");
    expect(d.loan_amount_sought).toBe(500_000);
    // Untouched sections come back as the template, not undefined.
    expect(d.needs_objectives).toBe("");
    expect(d.applicants).toHaveLength(2);
    expect(d.applicants[0].contact.email).toBe("");
    expect(d.living_expenses).toHaveLength(LIVING_EXPENSE_LABELS.length);
  });

  it("deep-merges a partial applicant saved before nested fields existed", () => {
    // The exact failure mode this guards: a legacy blob has an applicant with a
    // surname but no current_address/contact/employment sub-objects. If hydrate
    // left them undefined the form would read `.tenure` off undefined and crash.
    const legacy = {
      applicants: [{ surname: "Smith", given_names: "John" }, { surname: "Smith", given_names: "Jane" }],
    };
    const d = hydrateNeedsAnalysis(legacy);

    expect(d.applicants[0].given_names).toBe("John");
    expect(d.applicants[0].current_address).toEqual({
      street: "",
      suburb: "",
      state: "",
      postcode: "",
      date_moved_in: "",
      tenure: "",
    });
    expect(d.applicants[0].current_employment.employer.suburb).toBe("");
    expect(d.applicants[1].contact.preferred_contact).toBe("");
  });

  it("overlays fixed living-expense rows by index without growing the list", () => {
    const d = hydrateNeedsAnalysis({
      living_expenses: [{ amount: 250, frequency: "wk", description: "electricity + water" }],
    });
    expect(d.living_expenses).toHaveLength(LIVING_EXPENSE_LABELS.length);
    expect(d.living_expenses[0]).toEqual({ amount: 250, frequency: "wk", description: "electricity + water" });
    expect(d.living_expenses[1]).toEqual({ amount: null, frequency: "m", description: "" });
  });

  it("keeps user-added asset and liability rows", () => {
    const d = emptyNeedsAnalysis();
    d.assets.push({ ...d.assets[0], id: "asset-x", description: "Boat" });
    const back = hydrateNeedsAnalysis(JSON.parse(JSON.stringify(d)));
    expect(back.assets).toHaveLength(d.assets.length);
    expect(back.assets[back.assets.length - 1].description).toBe("Boat");
  });

  it("round-trips a filled form through JSON unchanged", () => {
    const d = completeNeedsAnalysis();
    d.purchased_or_signed_cos = true;
    d.first_home_buyer = false;
    d.assets[0].estimated_value = 900_000;
    d.liabilities[0].loan_balance = 400_000;
    d.living_expenses[0] = { amount: 100, frequency: "wk", description: "" };
    expect(hydrateNeedsAnalysis(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("preserves the yes/no basics through a round-trip", () => {
    const d = hydrateNeedsAnalysis({ purchased_or_signed_cos: true, first_home_buyer: false });
    expect(d.purchased_or_signed_cos).toBe(true);
    expect(d.first_home_buyer).toBe(false);
  });
});

describe("needsAnalysisErrMessage", () => {
  it("reads a Supabase PostgrestError, which is a plain object not an Error", () => {
    expect(needsAnalysisErrMessage({ message: "duplicate key value" }, "Save failed")).toBe("duplicate key value");
    expect(needsAnalysisErrMessage({ details: "Key (id) already exists" }, "Save failed")).toBe("Key (id) already exists");
    expect(needsAnalysisErrMessage({ hint: "Perhaps you meant id" }, "Save failed")).toBe("Perhaps you meant id");
    expect(needsAnalysisErrMessage({ code: "23505" }, "Save failed")).toBe("23505");
  });

  it("delegates Errors and unknown values to the shared helper", () => {
    expect(needsAnalysisErrMessage(new Error("boom"), "Save failed")).toBe("boom");
    expect(needsAnalysisErrMessage(null, "Save failed")).toBe("Save failed");
    expect(needsAnalysisErrMessage(42, "Save failed")).toBe("Save failed");
  });
});

describe("needsAnalysesTableMissing", () => {
  it("detects an unmigrated table", () => {
    expect(needsAnalysesTableMissing({ code: "42P01" })).toBe(true);
    expect(needsAnalysesTableMissing({ code: "PGRST205" })).toBe(true);
    expect(
      needsAnalysesTableMissing({ message: "Could not find the table 'public.nccp_needs_analyses' in the schema cache" }),
    ).toBe(true);
    expect(needsAnalysesTableMissing({ message: 'relation "nccp_needs_analyses" does not exist' })).toBe(true);
  });

  it("does NOT treat a missing column as a missing table", () => {
    expect(
      needsAnalysesTableMissing({
        code: "PGRST204",
        message: "Could not find the 'applicant_name' column of 'nccp_needs_analyses' in the schema cache",
      }),
    ).toBe(false);
    expect(
      needsAnalysesTableMissing({ code: "42703", message: "column nccp_needs_analyses.applicant_name does not exist" }),
    ).toBe(false);
  });

  it("does not swallow unrelated failures", () => {
    expect(needsAnalysesTableMissing(null)).toBe(false);
    expect(needsAnalysesTableMissing({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(needsAnalysesTableMissing(new Error("fetch failed"))).toBe(false);
  });
});
