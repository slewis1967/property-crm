import { describe, expect, it } from "vitest";
import {
  hecsRepayment,
  incomeTax,
  lito,
  loanFromMonthly,
  medicareLevy,
  netIncome,
  pAndIMonthly,
  MEDICARE_LOWER_SINGLE,
  MEDICARE_UPPER_SINGLE,
} from "./tax";

describe("incomeTax", () => {
  it("is nil below the tax-free threshold", () => {
    expect(incomeTax(18200)).toBe(0);
    expect(incomeTax(0)).toBe(0);
  });

  it("is continuous across every bracket boundary", () => {
    for (const b of [18200, 45000, 135000, 190000]) {
      const below = incomeTax(b);
      const above = incomeTax(b + 1);
      expect(above - below).toBeLessThan(1); // no cliff
    }
  });

  it("matches published figures", () => {
    expect(incomeTax(45000)).toBeCloseTo(4288, 0);
    expect(incomeTax(135000)).toBeCloseTo(31288, 0);
    expect(incomeTax(190000)).toBeCloseTo(51638, 0);
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
    expect(lito(41250)).toBeCloseTo(512.5, 5); // midpoint of the 5c taper
  });

  it("never goes negative", () => {
    expect(lito(66666)).toBeGreaterThanOrEqual(0);
  });
});

describe("medicareLevy", () => {
  it("has no cliff at the lower threshold", () => {
    expect(medicareLevy(MEDICARE_LOWER_SINGLE)).toBe(0);
    expect(medicareLevy(MEDICARE_LOWER_SINGLE + 1)).toBeCloseTo(0.1, 5);
  });

  it("shades in at 10c and lands exactly on 2% at the upper threshold", () => {
    const atUpper = medicareLevy(MEDICARE_UPPER_SINGLE);
    expect(atUpper).toBeCloseTo(MEDICARE_UPPER_SINGLE * 0.02, 0);
  });

  it("is a flat 2% above the upper threshold", () => {
    expect(medicareLevy(120000)).toBeCloseTo(2400, 5);
  });

  it("is monotonically increasing (the old cliff was not)", () => {
    let prev = -1;
    for (let g = 26000; g <= 36000; g += 100) {
      const levy = medicareLevy(g);
      expect(levy).toBeGreaterThanOrEqual(prev);
      prev = levy;
    }
  });
});

describe("hecsRepayment", () => {
  it("is nil below the $67,000 threshold", () => {
    expect(hecsRepayment(66999)).toBe(0);
    expect(hecsRepayment(54435)).toBe(0); // old scale charged 1% here
  });

  it("charges 15c in the dollar over the threshold", () => {
    expect(hecsRepayment(77000)).toBeCloseTo(1500, 5);
    expect(hecsRepayment(125000)).toBeCloseTo(8700, 5);
  });

  it("charges 17c above $125,000", () => {
    expect(hecsRepayment(150000)).toBeCloseTo(8700 + 25000 * 0.17, 5);
  });

  it("has no cliff at either threshold", () => {
    expect(hecsRepayment(67001) - hecsRepayment(67000)).toBeLessThan(1);
    expect(hecsRepayment(125001) - hecsRepayment(125000)).toBeLessThan(1);
  });

  it("is capped at the outstanding balance", () => {
    const capped = netIncome(150000, { hasHecs: true, hecsBalance: 500 });
    expect(capped.hecs).toBe(500);
  });
});

describe("netIncome", () => {
  it("returns zeros for nil income", () => {
    expect(netIncome(0).net).toBe(0);
  });

  it("applies LITO but never past zero tax", () => {
    const r = netIncome(20000);
    expect(r.tax).toBe(0); // raw tax $288, LITO $700 → clamped, not negative
    expect(r.litoOffset).toBe(288);
    expect(r.net).toBe(20000);
  });

  it("does not let LITO wipe out the Medicare levy", () => {
    const r = netIncome(40000);
    expect(r.medicare).toBeGreaterThan(0);
    expect(r.net).toBeLessThan(40000);
  });

  it("is monotonic in gross — earning more never nets less", () => {
    let prev = -1;
    for (let g = 0; g <= 250000; g += 500) {
      const net = netIncome(g, { hasHecs: true }).net;
      expect(net).toBeGreaterThanOrEqual(prev);
      prev = net;
    }
  });

  it("only deducts HECS when the borrower has a debt", () => {
    expect(netIncome(100000, { hasHecs: false }).hecs).toBe(0);
    expect(netIncome(100000, { hasHecs: true }).hecs).toBeGreaterThan(0);
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
    // $500k @ 6% over 30yr ≈ $2,997.75/mo
    expect(pAndIMonthly(500000, 6, 30)).toBeCloseTo(2997.75, 1);
  });
});
