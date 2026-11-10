import { describe, it, expect } from "vitest";
import {
  applicantSummary,
  computeTotals,
  emptyFactFind,
  factFindErrMessage,
  factFindsTableMissing,
  formatMoney,
  hydrateFactFind,
  outstandingSections,
  DISCLOSURE_QUESTIONS,
  type FactFindData,
} from "./factfind";

/** A fact find with just enough filled in to be Complete. */
function completeFactFind(): FactFindData {
  const d = emptyFactFind();
  d.applicants[0] = {
    ...d.applicants[0],
    family_name: "Smith",
    given_names: "John",
    date_of_birth: "1980-04-01",
    address: "12 Example St, Brisbane",
    annual_income: 120_000,
  };
  d.loan.amount_required = 750_000;
  d.loan.purpose = "Purchase of investment property";
  d.loan.repayment_strategy = "Refinance to a term facility on completion";
  d.securities[0].address = "12 Example St, Brisbane";
  for (const q of DISCLOSURE_QUESTIONS) d.disclosures[q.key] = { answer: "no", details: "" };
  d.declarations.info_confirmed = true;
  d.declarations.privacy.acknowledged = true;
  return d;
}

describe("computeTotals", () => {
  it("is all zeros for an empty fact find", () => {
    expect(computeTotals(emptyFactFind())).toEqual({
      totalLiabilities: 0,
      totalAssets: 0,
      surplusAssets: 0,
      monthlyCommitments: 0,
    });
  });

  it("sums balances, values and the monthly column", () => {
    const d = emptyFactFind();
    d.financials.liabilities[0].balance = 400_000; // mortgage
    d.financials.liabilities[0].monthly = 2_400;
    d.financials.liabilities[3].balance = 25_000; // car lease
    d.financials.liabilities[3].monthly = 600;
    d.financials.assets[0].value = 900_000; // property
    d.financials.assets[3].value = 50_000; // cash at bank

    expect(computeTotals(d)).toEqual({
      totalLiabilities: 425_000,
      totalAssets: 950_000,
      surplusAssets: 525_000,
      monthlyCommitments: 3_000,
    });
  });

  it("ignores null and non-finite entries rather than producing NaN", () => {
    const d = emptyFactFind();
    d.financials.assets[0].value = 100;
    d.financials.assets[1].value = null;
    d.financials.assets[2].value = Number.NaN;
    d.financials.liabilities[0].balance = Number.POSITIVE_INFINITY;

    const t = computeTotals(d);
    expect(t.totalAssets).toBe(100);
    expect(t.totalLiabilities).toBe(0);
    expect(t.surplusAssets).toBe(100);
  });

  it("reports a negative surplus when liabilities exceed assets", () => {
    const d = emptyFactFind();
    d.financials.liabilities[0].balance = 500_000;
    d.financials.assets[0].value = 300_000;
    expect(computeTotals(d).surplusAssets).toBe(-200_000);
  });
});

describe("formatMoney", () => {
  it("renders whole dollars with a thousands separator", () => {
    //   — Intl uses a non-breaking space after the symbol in some ICU builds.
    expect(formatMoney(400000).replace(/ /g, " ")).toBe("$400,000");
    expect(formatMoney(3300).replace(/ /g, " ")).toBe("$3,300");
  });

  it("rounds to whole dollars", () => {
    expect(formatMoney(1234.56)).toContain("1,235");
  });

  it("formats zero as $0, not an empty string", () => {
    // The list view renders `formatMoney(n) || "—"`, so a zero that stringified
    // to "" would silently display as an em-dash instead of a real $0 balance.
    expect(formatMoney(0)).toContain("0");
    expect(formatMoney(0)).not.toBe("");
  });

  it("renders a negative surplus with a minus sign", () => {
    expect(formatMoney(-200000)).toContain("200,000");
    expect(formatMoney(-200000)).toMatch(/-|\(/);
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
    const d = emptyFactFind();
    d.applicants[0].family_name = "Smith";
    d.applicants[0].given_names = "John";
    expect(applicantSummary(d)).toBe("Smith, John");

    d.applicants[1].family_name = "Smith";
    d.applicants[1].given_names = "Jane";
    expect(applicantSummary(d)).toBe("Smith, John & Smith, Jane");
  });

  it("is empty when nothing is filled in", () => {
    expect(applicantSummary(emptyFactFind())).toBe("");
  });
});

describe("outstandingSections", () => {
  it("lists every gap on an empty form", () => {
    const missing = outstandingSections(emptyFactFind());
    expect(missing).toContain("Applicant 1 name");
    expect(missing).toContain("Loan amount required");
    expect(missing).toContain("All disclosure questions answered");
    expect(missing).toContain("Privacy consent acknowledged");
  });

  it("is empty once the required fields are answered", () => {
    expect(outstandingSections(completeFactFind())).toEqual([]);
  });

  it("flags a missing applicant income", () => {
    // Without income there is no servicing assessment, so the fact find can't
    // go to credit even though every field the paper form asks for is filled.
    const d = completeFactFind();
    d.applicants[0].annual_income = null;
    expect(outstandingSections(d)).toEqual(["Applicant 1 annual income"]);
  });

  it("accepts a zero income as answered rather than missing", () => {
    const d = completeFactFind();
    d.applicants[0].annual_income = 0;
    expect(outstandingSections(d)).toEqual([]);
  });

  it("still flags an unanswered disclosure", () => {
    const d = completeFactFind();
    d.disclosures.bankruptcy = { answer: null, details: "" };
    expect(outstandingSections(d)).toEqual(["All disclosure questions answered"]);
  });

  it("treats a 'no' answer as answered, not as missing", () => {
    const d = completeFactFind();
    expect(outstandingSections(d)).not.toContain("All disclosure questions answered");
  });
});

describe("hydrateFactFind", () => {
  it("returns a clean template for junk input", () => {
    expect(hydrateFactFind(null)).toEqual(emptyFactFind());
    expect(hydrateFactFind("nope")).toEqual(emptyFactFind());
    expect(hydrateFactFind(undefined)).toEqual(emptyFactFind());
  });

  it("backfills sections a stored blob never had", () => {
    const partial = { referred_by: "Glenn Mays", loan: { amount_required: 500_000 } };
    const d = hydrateFactFind(partial);

    expect(d.referred_by).toBe("Glenn Mays");
    expect(d.loan.amount_required).toBe(500_000);
    // Untouched sections come back as the template, not undefined.
    expect(d.loan.purpose).toBe("");
    expect(d.applicants).toHaveLength(2);
    expect(d.financials.liabilities.length).toBeGreaterThan(0);
    expect(d.declarations.privacy.acknowledged).toBe(false);
  });

  it("preserves stored answers and rejects an invalid disclosure answer", () => {
    const d = hydrateFactFind({
      disclosures: {
        bankruptcy: { answer: "yes", details: "Discharged 2015" },
        judgement: { answer: "maybe", details: "" },
      },
    });
    expect(d.disclosures.bankruptcy).toEqual({ answer: "yes", details: "Discharged 2015" });
    expect(d.disclosures.judgement.answer).toBeNull();
  });

  it("round-trips a filled form through JSON unchanged", () => {
    const d = completeFactFind();
    expect(hydrateFactFind(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("keeps extra security properties the user added", () => {
    const d = emptyFactFind();
    d.securities.push({ ...d.securities[0], address: "3rd security" });
    expect(hydrateFactFind(JSON.parse(JSON.stringify(d))).securities).toHaveLength(3);
  });
});

describe("servicing fields (added after the paper form)", () => {
  it("emptyFactFind defaults every servicing field", () => {
    const d = emptyFactFind();
    for (const a of d.applicants) {
      expect(a.annual_income).toBeNull();
      expect(a.has_hecs).toBe(false);
      expect(a.hecs_balance).toBeNull();
    }
    expect(d.financials.servicing).toEqual({ dependents: null, monthly_living_expenses: null });
  });

  it("hydrates a row saved BEFORE the servicing fields existed", () => {
    // The exact failure mode this guards: a pre-bridge blob has no
    // `financials.servicing` and no `annual_income`. If hydrate leaves them
    // undefined, the form reads `.dependents` off undefined and crashes.
    const legacy = {
      referred_by: "Glenn Mays",
      applicants: [
        { family_name: "Smith", given_names: "John" },
        { family_name: "Smith", given_names: "Jane" },
      ],
      financials: { statement_for: "John & Jane", liabilities: [], assets: [] },
    };
    const d = hydrateFactFind(legacy);

    expect(d.financials.servicing).toEqual({ dependents: null, monthly_living_expenses: null });
    expect(d.applicants[0].annual_income).toBeNull();
    expect(d.applicants[0].has_hecs).toBe(false);
    expect(d.applicants[1].hecs_balance).toBeNull();
    // and it didn't clobber what the legacy row did have
    expect(d.applicants[0].given_names).toBe("John");
    expect(d.referred_by).toBe("Glenn Mays");
  });

  it("preserves stored servicing values through a round-trip", () => {
    const d = emptyFactFind();
    d.applicants[0].annual_income = 120_000;
    d.applicants[0].has_hecs = true;
    d.applicants[0].hecs_balance = 24_000;
    d.financials.servicing = { dependents: 2, monthly_living_expenses: 3_000 };

    const back = hydrateFactFind(JSON.parse(JSON.stringify(d)));
    expect(back.applicants[0].annual_income).toBe(120_000);
    expect(back.applicants[0].has_hecs).toBe(true);
    expect(back.applicants[0].hecs_balance).toBe(24_000);
    expect(back.financials.servicing).toEqual({ dependents: 2, monthly_living_expenses: 3_000 });
  });

  it("keeps a zero dependents count distinct from 'not answered'", () => {
    const d = hydrateFactFind({ financials: { servicing: { dependents: 0, monthly_living_expenses: 0 } } });
    expect(d.financials.servicing.dependents).toBe(0);
    expect(d.financials.servicing.monthly_living_expenses).toBe(0);
  });
});

describe("factFindErrMessage", () => {
  it("reads a Supabase PostgrestError, which is a plain object not an Error", () => {
    // The shared errMessage() only handles Error/string; on its own it would
    // return the fallback here and throw away what the database said.
    expect(factFindErrMessage({ message: "duplicate key value" }, "Save failed")).toBe("duplicate key value");
    expect(factFindErrMessage({ details: "Key (id) already exists" }, "Save failed")).toBe("Key (id) already exists");
    expect(factFindErrMessage({ hint: "Perhaps you meant id" }, "Save failed")).toBe("Perhaps you meant id");
    expect(factFindErrMessage({ code: "23505" }, "Save failed")).toBe("23505");
  });

  it("delegates Errors and unknown values to the shared helper", () => {
    expect(factFindErrMessage(new Error("boom"), "Save failed")).toBe("boom");
    expect(factFindErrMessage(null, "Save failed")).toBe("Save failed");
    expect(factFindErrMessage(undefined, "Save failed")).toBe("Save failed");
    expect(factFindErrMessage(42, "Save failed")).toBe("Save failed");
  });
});

describe("factFindsTableMissing", () => {
  it("detects an unmigrated table", () => {
    expect(factFindsTableMissing({ code: "42P01" })).toBe(true);
    expect(factFindsTableMissing({ code: "PGRST205" })).toBe(true);
    expect(
      factFindsTableMissing({ message: "Could not find the table 'public.borrower_fact_finds' in the schema cache" }),
    ).toBe(true);
    expect(factFindsTableMissing({ message: 'relation "borrower_fact_finds" does not exist' })).toBe(true);
  });

  it("does NOT treat a missing column as a missing table", () => {
    // The bug this guards: a schema mismatch told the operator to re-run a
    // migration they had already run.
    expect(
      factFindsTableMissing({
        code: "PGRST204",
        message: "Could not find the 'applicant_name' column of 'borrower_fact_finds' in the schema cache",
      }),
    ).toBe(false);
    expect(
      factFindsTableMissing({ code: "42703", message: "column borrower_fact_finds.applicant_name does not exist" }),
    ).toBe(false);
  });

  it("does not swallow unrelated failures", () => {
    expect(factFindsTableMissing(null)).toBe(false);
    expect(factFindsTableMissing({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(factFindsTableMissing(new Error("fetch failed"))).toBe(false);
  });
});
