import { describe, it, expect } from "vitest";
import { needsAnalysisToDeclaredIncome } from "./income-reconciliation-run";
import { emptyNeedsAnalysis } from "./needsAnalysis";
import { factFindToNeedsAnalysis } from "./factFindToNeedsAnalysis";
import { emptyFactFind } from "./factfind";

/**
 * The declared side of the reconciliation, from both of its sources.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. `loadDeclaredIncome` returning nothing
 * does not raise a finding — it sets `declaredUnavailable` and the whole
 * comparison quietly has nothing to compare against. A silent exemption from
 * the check is indistinguishable, in the CRM, from a file that passed it.
 *
 * So the Fact-Find fallback is pinned here: an application with a Fact Find and
 * no Needs Analysis — which is precisely the shape a Tier 2 introducer pack
 * arrives in — must still produce a declared figure.
 */

describe("needsAnalysisToDeclaredIncome", () => {
  it("annualises a fortnightly figure rather than reporting it raw", () => {
    const na = emptyNeedsAnalysis();
    na.applicants[0].given_names = "David";
    na.applicants[0].surname = "Halliday";
    na.applicants[0].current_employment.income_amount = 3_000;
    na.applicants[0].current_employment.pay_frequency = "fn";

    const [d] = needsAnalysisToDeclaredIncome(na);
    expect(d.applicant).toBe("David Halliday");
    expect(d.annual).toBe(78_000);
  });

  it("skips an applicant slot with no name rather than inventing one", () => {
    const na = emptyNeedsAnalysis();
    na.applicants[0].given_names = "David";
    expect(needsAnalysisToDeclaredIncome(na)).toHaveLength(1);
  });

  /**
   * The employer name has no field of its own; reps type it into the address
   * block. Occupation is the fallback. Losing this mapping would turn every
   * employer-match finding off without anything looking broken.
   */
  it("reads the employer from the address line, falling back to occupation", () => {
    const na = emptyNeedsAnalysis();
    na.applicants[0].given_names = "David";
    na.applicants[0].current_employment.employer.street = "Woolworths Bateau Bay";
    expect(needsAnalysisToDeclaredIncome(na)[0].employer).toBe("Woolworths Bateau Bay");

    const na2 = emptyNeedsAnalysis();
    na2.applicants[0].given_names = "David";
    na2.applicants[0].current_employment.occupation = "Retail assistant";
    expect(needsAnalysisToDeclaredIncome(na2)[0].employer).toBe("Retail assistant");
  });
});

describe("a Fact Find alone still yields a declared position", () => {
  /**
   * The Tier 2 pack shape: a fact find, no needs analysis, no contact. Carried
   * through the same bridge the staff "seed a Needs Analysis" button uses, so
   * there is one mapping rather than two that can drift.
   */
  function packFactFind() {
    const ff = emptyFactFind();
    ff.applicants[0].given_names = "David";
    ff.applicants[0].family_name = "Halliday";
    ff.applicants[0].annual_income = 186_000;
    ff.applicants[0].occupation = "Retail assistant";
    return ff;
  }

  it("carries the gross annual figure through unchanged", () => {
    const declared = needsAnalysisToDeclaredIncome(factFindToNeedsAnalysis(packFactFind()).data);
    expect(declared).toHaveLength(1);
    expect(declared[0].applicant).toBe("David Halliday");
    // The Fact Find records gross annual; the bridge marks it "pa", so
    // annualising must be the identity rather than multiplying by 26.
    expect(declared[0].annual).toBe(186_000);
  });

  it("covers a second applicant once the pack has one", () => {
    const ff = packFactFind();
    ff.applicants[1].given_names = "Jane";
    ff.applicants[1].family_name = "Halliday";
    ff.applicants[1].annual_income = 54_000;

    const declared = needsAnalysisToDeclaredIncome(factFindToNeedsAnalysis(ff).data);
    expect(declared.map((d) => d.annual)).toEqual([186_000, 54_000]);
  });

  /**
   * What the Fact Find genuinely cannot supply. Asserted rather than left
   * unsaid: the employer-match and part-year findings depend on these, so a
   * Fact-Find-only application is checked on the headline comparison and not on
   * those. Anyone widening the fallback should see the limit written down.
   */
  it("has no employment start date or basis to offer", () => {
    const [d] = needsAnalysisToDeclaredIncome(factFindToNeedsAnalysis(packFactFind()).data);
    expect(d.startedOn).toBeNull();
    expect(d.basis).toBeNull();
    // Occupation stands in for the employer, as it does on the Needs Analysis
    // path when the address line is blank.
    expect(d.employer).toBe("Retail assistant");
  });

  it("yields nothing for a fact find nobody has typed a name into", () => {
    expect(needsAnalysisToDeclaredIncome(factFindToNeedsAnalysis(emptyFactFind()).data)).toEqual([]);
  });
});
