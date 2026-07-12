import { describe, expect, it } from "vitest";
import {
  AUS_STATES,
  FHB_FULL_CAP,
  FHB_PARTIAL_CAP,
  dutyPayable,
  fhbDuty,
  standardDuty,
  type AusState,
} from "./stampDuty";

/**
 * Regression guard for transfer (stamp) duty — a "money path" that feeds
 * `solvePurchasePrice` (duty is netted out of the deposit before the purchase
 * price is set), so a silent change here quietly moves every borrower's
 * assessed purchase price and LVR.
 *
 * Every expected dollar figure below is HAND-DERIVED from the bracket tables in
 * `stampDuty.ts` (progressive: base + rate × excess-over-previous-bound), not
 * copied from the function output. If the tables change, these must be
 * re-derived deliberately — that is the point.
 */

describe("standardDuty — progressive brackets by state", () => {
  it("returns zero for a non-positive price", () => {
    expect(standardDuty("NSW", 0)).toBe(0);
    expect(standardDuty("VIC", -100)).toBe(0);
  });

  // NSW brackets: …[97000,485,.0175],[364000,1570,.035],[1212000,10915,.045]…
  it("NSW: mid, sub-median and above-median price points", () => {
    // 90k: 485 + (90,000 − 35,000) × 0.0175 = 485 + 962.5
    expect(standardDuty("NSW", 90000)).toBeCloseTo(1447.5, 4);
    // 500k: 10,915 + (500,000 − 364,000) × 0.045 = 10,915 + 6,120
    expect(standardDuty("NSW", 500000)).toBeCloseTo(17035, 4);
    // 850k: 10,915 + (850,000 − 364,000) × 0.045 = 10,915 + 21,870
    expect(standardDuty("NSW", 850000)).toBeCloseTo(32785, 4);
  });

  // VIC brackets: …[960000,2870,.06]…
  it("VIC: 6% marginal band", () => {
    // 500k: 2,870 + (500,000 − 130,000) × 0.06 = 2,870 + 22,200
    expect(standardDuty("VIC", 500000)).toBeCloseTo(25070, 4);
    // 700k: 2,870 + (700,000 − 130,000) × 0.06 = 2,870 + 34,200
    expect(standardDuty("VIC", 700000)).toBeCloseTo(37070, 4);
  });

  // QLD brackets: …[540000,1050,.035],[1000000,17325,.045]…
  it("QLD: straddling the 540k bracket boundary", () => {
    // 500k: 1,050 + (500,000 − 75,000) × 0.035 = 1,050 + 14,875
    expect(standardDuty("QLD", 500000)).toBeCloseTo(15925, 4);
    // 750k: 17,325 + (750,000 − 540,000) × 0.045 = 17,325 + 9,450
    expect(standardDuty("QLD", 750000)).toBeCloseTo(26775, 4);
  });

  it("WA / SA / ACT / TAS: one derived point each", () => {
    // WA …[725000,11115,.0475]: 11,115 + (500,000 − 360,000) × 0.0475
    expect(standardDuty("WA", 500000)).toBeCloseTo(17765, 4);
    // SA …[500000,11330,.05]: 11,330 + (400,000 − 300,000) × 0.05
    expect(standardDuty("SA", 400000)).toBeCloseTo(16330, 4);
    // ACT …[750000,13580,.0411]: 13,580 + (600,000 − 500,000) × 0.0411
    expect(standardDuty("ACT", 600000)).toBeCloseTo(17690, 4);
    // TAS …[725000,12935,.0425]: 12,935 + (500,000 − 375,000) × 0.0425
    expect(standardDuty("TAS", 500000)).toBeCloseTo(18247.5, 4);
  });

  it("NT: near-flat 4.949% formula", () => {
    // NT is modelled as a single flat-ish rate: 500,000 × 0.04949
    expect(standardDuty("NT", 500000)).toBeCloseTo(24745, 4);
  });

  it("is monotonic non-decreasing in price for every state", () => {
    for (const state of AUS_STATES) {
      let prev = -1;
      for (const price of [0, 50000, 200000, 500000, 900000, 1500000, 3000000]) {
        const duty = standardDuty(state, price);
        expect(duty).toBeGreaterThanOrEqual(prev);
        prev = duty;
      }
    }
  });
});

describe("fhbDuty — first-home-buyer concession", () => {
  it("waives duty entirely at or below the full-exemption cap", () => {
    // NSW full cap 800k
    expect(fhbDuty("NSW", 700000)).toBe(0);
    expect(fhbDuty("NSW", FHB_FULL_CAP.NSW)).toBe(0);
    // QLD full cap 700k
    expect(fhbDuty("QLD", 650000)).toBe(0);
    expect(fhbDuty("VIC", 550000)).toBe(0);
  });

  it("linearly tapers between the full cap and the partial cap", () => {
    // NSW: full 800k → partial 1,000,000.
    // At 900k the taper fraction is (900,000 − 800,000)/(1,000,000 − 800,000)=0.5.
    // standardDuty(NSW, 900,000) = 10,915 + (900,000 − 364,000) × 0.045 = 35,035.
    // fhbDuty = 35,035 × 0.5 = 17,517.5
    expect(fhbDuty("NSW", 900000)).toBeCloseTo(17517.5, 4);
    // VIC: full 600k → partial 750k. At 700k fraction = 100,000/150,000 = 2/3.
    // standardDuty(VIC, 700,000) = 37,070 → 37,070 × 2/3
    expect(fhbDuty("VIC", 700000)).toBeCloseTo(24713.3333, 3);
  });

  it("charges the full standard duty at or above the partial cap (concession gone)", () => {
    // NSW at the partial cap 1,000,000 → equals standard duty
    expect(fhbDuty("NSW", 1000000)).toBeCloseTo(standardDuty("NSW", 1000000), 4);
    expect(fhbDuty("NSW", 1000000)).toBeCloseTo(39535, 4);
    // QLD at its partial cap 800k → full standard
    expect(fhbDuty("QLD", 800000)).toBeCloseTo(29025, 4);
    // WA at its partial cap 601k → full standard
    expect(fhbDuty("WA", 601000)).toBeCloseTo(22562.5, 4);
  });

  it("every supported state exposes a concession band (no state without one)", () => {
    // There is no supported state that lacks an FHB concession: each has a full
    // cap below its partial cap. Below the full cap duty is 0; at/above the
    // partial cap the concession has fully phased out to the standard figure.
    for (const state of AUS_STATES) {
      expect(FHB_FULL_CAP[state]).toBeGreaterThan(0);
      expect(FHB_PARTIAL_CAP[state]).toBeGreaterThan(FHB_FULL_CAP[state]);
      expect(fhbDuty(state, 1)).toBe(0); // trivially below any full cap
      const wayAbove = FHB_PARTIAL_CAP[state] + 250000;
      expect(fhbDuty(state, wayAbove)).toBeCloseTo(standardDuty(state, wayAbove), 4);
    }
  });

  it("an FHB never pays more than a standard buyer at the same price", () => {
    for (const state of AUS_STATES) {
      for (const price of [400000, 650000, 750000, 900000, 1200000]) {
        expect(fhbDuty(state, price)).toBeLessThanOrEqual(standardDuty(state, price) + 1e-6);
      }
    }
  });
});

describe("dutyPayable — dispatch by FHB flag", () => {
  it("routes to fhbDuty when isFhb, standardDuty otherwise", () => {
    // QLD 650k: below FHB full cap (700k) → 0 for an FHB; standard = 22,275.
    expect(dutyPayable("QLD", 650000, true)).toBe(0);
    expect(dutyPayable("QLD", 650000, false)).toBeCloseTo(22275, 4);
  });

  it("the FHB-vs-standard divergence is real money in the concession band", () => {
    const state: AusState = "NSW";
    const price = 750000; // below NSW full cap 800k
    const fhb = dutyPayable(state, price, true);
    const std = dutyPayable(state, price, false);
    expect(std).toBeGreaterThan(0);
    expect(fhb).toBe(0);
    expect(std - fhb).toBe(std);
  });
});
