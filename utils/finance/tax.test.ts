import { describe, expect, it } from "vitest";
import {
  CURRENT_TAX_YEAR,
  hecsRepayment,
  incomeTax,
  lito,
  loanFromMonthly,
  marginalTaxRate,
  medicareLevy,
  MEDICARE,
  pAndIMonthly,
  personalTax,
  standardDeduction,
  TAX_YEARS,
  type TaxYear,
} from "./tax";

describe("incomeTax", () => {
  it("is nil below the tax-free threshold in every year", () => {
    for (const y of TAX_YEARS) {
      expect(incomeTax(18200, y)).toBe(0);
      expect(incomeTax(0, y)).toBe(0);
    }
  });

  it("is continuous across every bracket boundary in every year", () => {
    for (const y of TAX_YEARS) {
      for (const b of [18200, 45000, 135000, 190000]) {
        expect(incomeTax(b + 1, y) - incomeTax(b, y)).toBeLessThan(1);
      }
    }
  });

  it("matches the published 2025-26 schedule (16c bracket)", () => {
    expect(incomeTax(45000, "2025-26")).toBeCloseTo(4288, 0);
    expect(incomeTax(135000, "2025-26")).toBeCloseTo(31288, 0);
    expect(incomeTax(190000, "2025-26")).toBeCloseTo(51638, 0);
  });

  it("applies the 15c bracket from 2026-27 (More Cost of Living Relief Act 2025)", () => {
    expect(incomeTax(45000, "2026-27")).toBeCloseTo(4020, 0);
    expect(incomeTax(135000, "2026-27")).toBeCloseTo(31020, 0);
    expect(incomeTax(190000, "2026-27")).toBeCloseTo(51370, 0);
  });

  it("applies the 14c bracket from 2027-28", () => {
    expect(incomeTax(45000, "2027-28")).toBeCloseTo(3752, 0);
    expect(incomeTax(190000, "2027-28")).toBeCloseTo(51102, 0);
  });

  it("cuts tax year on year for the same income", () => {
    for (const g of [30000, 60000, 120000, 250000]) {
      expect(incomeTax(g, "2026-27")).toBeLessThan(incomeTax(g, "2025-26"));
      expect(incomeTax(g, "2027-28")).toBeLessThan(incomeTax(g, "2026-27"));
    }
  });

  it("caps the saving at $268 — only the lowest bracket changed", () => {
    // 26,800 × 1c. A millionaire saves the same as someone on $45k.
    const saving = (y1: TaxYear, y2: TaxYear, g: number) => incomeTax(g, y1) - incomeTax(g, y2);
    expect(saving("2025-26", "2026-27", 45000)).toBeCloseTo(268, 0);
    expect(saving("2025-26", "2026-27", 1000000)).toBeCloseTo(268, 0);
  });

  it("defaults to the current income year", () => {
    expect(incomeTax(100000)).toBe(incomeTax(100000, CURRENT_TAX_YEAR));
  });
});

describe("marginalTaxRate", () => {
  it("returns the bracket rate plus Medicare above the levy threshold", () => {
    expect(marginalTaxRate(120000, "2026-27")).toBeCloseTo(0.32, 5);
    expect(marginalTaxRate(250000, "2026-27")).toBeCloseTo(0.47, 5);
  });

  it("uses the reduced lowest rate in the year it applies", () => {
    expect(marginalTaxRate(30000, "2025-26", false)).toBeCloseTo(0.16, 5);
    expect(marginalTaxRate(30000, "2026-27", false)).toBeCloseTo(0.15, 5);
    expect(marginalTaxRate(30000, "2027-28", false)).toBeCloseTo(0.14, 5);
  });

  it("omits Medicare below the levy threshold", () => {
    expect(marginalTaxRate(25000, "2026-27")).toBeCloseTo(0.15, 5);
  });

  it("is zero below the tax-free threshold", () => {
    expect(marginalTaxRate(15000, "2026-27")).toBe(0);
  });
});

describe("standardDeduction", () => {
  it("does not exist before 2026-27", () => {
    expect(standardDeduction("2025-26")).toBe(0);
  });

  it("is $1,000 from 2026-27 (Tax Reform No. 1 Act 2026)", () => {
    expect(standardDeduction("2026-27")).toBe(1000);
    expect(standardDeduction("2027-28")).toBe(1000);
  });
});

describe("lito", () => {
  it("is the full $700 up to $37,500 and zero past $66,667", () => {
    expect(lito(30000)).toBe(700);
    expect(lito(37500)).toBe(700);
    expect(lito(70000)).toBe(0);
  });

  it("tapers continuously through both withdrawal rates", () => {
    expect(lito(45000)).toBeCloseTo(325, 5);
    expect(lito(66667)).toBeCloseTo(0, 1);
    expect(lito(41250)).toBeCloseTo(512.5, 5);
  });

  it("never goes negative", () => {
    expect(lito(66666)).toBeGreaterThanOrEqual(0);
  });
});

describe("medicareLevy", () => {
  const single = (income: number) =>
    medicareLevy({ familyTaxableIncome: income, dependents: 0, isFamily: false }, "2026-27");
  const family = (income: number, kids = 0) =>
    medicareLevy({ familyTaxableIncome: income, dependents: kids, isFamily: true }, "2026-27");

  it("has no cliff at the singles lower threshold", () => {
    const t = MEDICARE["2026-27"];
    expect(single(t.singleLower)).toBe(0);
    expect(single(t.singleLower + 1)).toBeCloseTo(0.1, 5);
  });

  it("shades in at 10c and lands on exactly 2% at the upper threshold", () => {
    const t = MEDICARE["2026-27"];
    expect(single(t.singleUpper)).toBeCloseTo(t.singleUpper * 0.02, 0);
  });

  it("is a flat 2% well above the threshold", () => {
    expect(single(120000)).toBeCloseTo(2400, 5);
  });

  it("is monotonically increasing (the old per-person cliff was not)", () => {
    let prev = -1;
    for (let g = 26000; g <= 40000; g += 100) {
      const levy = single(g);
      expect(levy).toBeGreaterThanOrEqual(prev);
      prev = levy;
    }
  });

  it("charges a family less than a single on the same income", () => {
    // The whole point of the family threshold.
    expect(family(50000)).toBeLessThan(single(50000));
    expect(family(50000)).toBeGreaterThan(0);
  });

  it("exempts a family below the family threshold entirely", () => {
    expect(family(47238)).toBe(0);
    expect(single(47238)).toBeGreaterThan(0);
  });

  it("lifts the family threshold for each dependent child", () => {
    // Lower threshold with 2 kids: 47,238 + 2×4,338 = 55,914.
    expect(family(55000, 0)).toBeGreaterThan(0);
    expect(family(55000, 2)).toBe(0);
    expect(family(55914, 2)).toBe(0);
    expect(family(56000, 2)).toBeCloseTo(8.6, 5); // just over: 86c × 10c
  });

  it("converges to 2% for families at high income", () => {
    expect(family(300000, 3)).toBeCloseTo(6000, 5);
  });

  it("is zero for nil income", () => {
    expect(single(0)).toBe(0);
    expect(family(0, 2)).toBe(0);
  });
});

describe("hecsRepayment", () => {
  it("is nil below the 2026-27 threshold of $69,528", () => {
    expect(hecsRepayment(69528, "2026-27")).toBe(0);
    expect(hecsRepayment(54435, "2026-27")).toBe(0); // the old 2024-25 scale charged 1% here
    expect(hecsRepayment(67500, "2026-27")).toBe(0); // above the 2025-26 threshold, below 2026-27
  });

  it("charges 15c in the dollar over the threshold", () => {
    expect(hecsRepayment(79528, "2026-27")).toBeCloseTo(1500, 5);
    expect(hecsRepayment(129717, "2026-27")).toBeCloseTo(9028, 0);
  });

  it("charges 17c in the second band", () => {
    expect(hecsRepayment(150000, "2026-27")).toBeCloseTo(9028 + (150000 - 129717) * 0.17, 0);
  });

  it("reverts to a flat 10% of TOTAL income above the top threshold", () => {
    // Not 10% of the excess — 10% of the whole repayment income.
    expect(hecsRepayment(200000, "2026-27")).toBeCloseTo(20000, 5);
    expect(hecsRepayment(300000, "2026-27")).toBeCloseTo(30000, 5);
  });

  it("has no cliff at any of the three boundaries", () => {
    for (const b of [69528, 129717, 186050]) {
      expect(Math.abs(hecsRepayment(b + 1, "2026-27") - hecsRepayment(b, "2026-27"))).toBeLessThan(1);
    }
  });

  it("uses the lower 2025-26 thresholds in that year", () => {
    expect(hecsRepayment(67000, "2025-26")).toBe(0);
    expect(hecsRepayment(77000, "2025-26")).toBeCloseTo(1500, 5);
    expect(hecsRepayment(125000, "2025-26")).toBeCloseTo(8700, 5);
  });

  it("indexation means the same income repays less in 2026-27 than 2025-26", () => {
    expect(hecsRepayment(100000, "2026-27")).toBeLessThan(hecsRepayment(100000, "2025-26"));
  });
});

describe("personalTax", () => {
  it("returns zeros for nil income", () => {
    expect(personalTax(0).netBeforeMedicare).toBe(0);
  });

  it("applies LITO but never past zero tax", () => {
    const r = personalTax(20000, { year: "2026-27", claimsStandardDeduction: false });
    expect(r.tax).toBe(0); // raw tax $270, LITO $700 → clamped, not negative
    expect(r.litoOffset).toBe(270);
  });

  it("excludes Medicare — that is a household charge", () => {
    const r = personalTax(120000, { year: "2026-27", claimsStandardDeduction: false });
    expect(r.netBeforeMedicare).toBe(120000 - r.tax);
  });

  it("applies the $1,000 standard deduction only from 2026-27", () => {
    const withDed = personalTax(120000, { year: "2026-27", claimsStandardDeduction: true });
    const without = personalTax(120000, { year: "2026-27", claimsStandardDeduction: false });
    expect(withDed.taxableIncome).toBe(119000);
    expect(without.tax - withDed.tax).toBeCloseTo(300, 0); // $1,000 × 30c

    const oldYear = personalTax(120000, { year: "2025-26", claimsStandardDeduction: true });
    expect(oldYear.taxableIncome).toBe(120000); // no such deduction in 2025-26
  });

  it("treats a rental loss as a deduction, lowering taxable income", () => {
    const geared = personalTax(120000, { year: "2026-27", investmentLoss: 10000 });
    const plain = personalTax(120000, { year: "2026-27" });
    expect(geared.taxableIncome).toBe(plain.taxableIncome - 10000);
    expect(geared.tax).toBeLessThan(plain.tax);
    expect(geared.netBeforeMedicare).toBeGreaterThan(plain.netBeforeMedicare);
  });

  it("adds the rental loss BACK for HELP repayment income", () => {
    // A negatively geared borrower does not get a HELP discount for the loss.
    const geared = personalTax(120000, { year: "2026-27", hasHecs: true, investmentLoss: 20000 });
    const plain = personalTax(120000, { year: "2026-27", hasHecs: true });
    expect(geared.hecs).toBeCloseTo(plain.hecs, 5);
    expect(geared.taxableIncome).toBeLessThan(plain.taxableIncome); // but tax did fall
  });

  it("caps the HELP repayment at the outstanding balance", () => {
    expect(personalTax(150000, { hasHecs: true, hecsBalance: 500 }).hecs).toBe(500);
  });

  it("only deducts HELP when the borrower has a debt", () => {
    expect(personalTax(100000, { hasHecs: false }).hecs).toBe(0);
    expect(personalTax(100000, { hasHecs: true }).hecs).toBeGreaterThan(0);
  });

  it("is monotonic in gross — earning more never nets less", () => {
    let prev = -1;
    for (let g = 0; g <= 250000; g += 500) {
      const net = personalTax(g, { hasHecs: true }).netBeforeMedicare;
      expect(net).toBeGreaterThanOrEqual(prev);
      prev = net;
    }
  });

  it("nets more in 2026-27 than 2025-26 — the tax cut plus the deduction", () => {
    const now = personalTax(90000, { year: "2026-27", claimsStandardDeduction: true });
    const before = personalTax(90000, { year: "2025-26", claimsStandardDeduction: true });
    expect(now.netBeforeMedicare).toBeGreaterThan(before.netBeforeMedicare);
  });
});

describe("pAndIMonthly / loanFromMonthly", () => {
  it("round-trips", () => {
    const monthly = pAndIMonthly(600000, 6.5, 30);
    expect(loanFromMonthly(monthly, 6.5, 30)).toBeCloseTo(600000, 2);
  });

  it("handles a zero rate", () => {
    expect(pAndIMonthly(120000, 0, 10)).toBeCloseTo(1000, 5);
  });

  it("is zero for a nil balance or nil term", () => {
    expect(pAndIMonthly(0, 6, 30)).toBe(0);
    expect(pAndIMonthly(500000, 6, 0)).toBe(0);
    expect(loanFromMonthly(0, 6, 30)).toBe(0);
  });

  it("matches a known repayment", () => {
    expect(pAndIMonthly(500000, 6, 30)).toBeCloseTo(2997.75, 1);
  });
});
