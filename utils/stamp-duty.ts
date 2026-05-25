/**
 * Stamp / transfer-duty estimator — for INSTANT recompute when the operator toggles
 * single vs dual contract or changes the dutiable value. These are the general /
 * investment transfer-duty brackets (no first-home or owner-occupier concessions,
 * which investors don't get). They're current-ish approximations and DO drift as
 * states reindex — so the figure is labelled an estimate, and the "Research market
 * figures" button fetches a web-verified, dated number when precision matters.
 */

export const AU_STATES = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"] as const;
export type AuState = (typeof AU_STATES)[number];

const round = (n: number) => Math.round(n);

/** Apply a progressive bracket table: [thresholdUpTo, baseDuty, marginalRate, over]. */
function bracket(v: number, rows: [number, number, number, number][]): number {
  for (const [upTo, base, rate, over] of rows) {
    if (v <= upTo) return base + rate * (v - over);
  }
  const [, base, rate, over] = rows[rows.length - 1];
  return base + rate * (v - over);
}

/**
 * Estimate transfer duty on a dutiable value for the given state.
 * Returns null when value is missing/invalid.
 */
export function estimateStampDuty(state: AuState | string | null | undefined, dutiableValue: number | null): number | null {
  if (!dutiableValue || dutiableValue <= 0) return null;
  const v = dutiableValue;
  switch ((state ?? "").toUpperCase()) {
    case "VIC":
      return round(
        bracket(v, [
          [25000, 0, 0.014, 0],
          [130000, 350, 0.024, 25000],
          [960000, 2870, 0.06, 130000],
          [2000000, 0.055 * v, 0, v], // flat 5.5% of full value in this band
          [Infinity, 110000, 0.065, 2000000],
        ]),
      );
    case "NSW":
      return round(
        bracket(v, [
          [17000, 0, 0.0125, 0],
          [36000, 212, 0.015, 17000],
          [97000, 497, 0.0175, 36000],
          [364000, 1564, 0.035, 97000],
          [1212000, 10909, 0.045, 364000],
          [3636000, 49069, 0.055, 1212000],
          [Infinity, 182389, 0.07, 3636000],
        ]),
      );
    case "QLD":
      return round(
        bracket(v, [
          [5000, 0, 0, 0],
          [75000, 0, 0.015, 5000],
          [540000, 1050, 0.035, 75000],
          [1000000, 17325, 0.045, 540000],
          [Infinity, 38025, 0.0575, 1000000],
        ]),
      );
    case "SA":
      return round(
        bracket(v, [
          [12000, 0, 0.01, 0],
          [30000, 120, 0.02, 12000],
          [50000, 480, 0.03, 30000],
          [100000, 1080, 0.035, 50000],
          [200000, 2830, 0.04, 100000],
          [250000, 6830, 0.0425, 200000],
          [300000, 8955, 0.0475, 250000],
          [500000, 11330, 0.05, 300000],
          [Infinity, 21330, 0.055, 500000],
        ]),
      );
    case "WA":
      return round(
        bracket(v, [
          [120000, 0, 0.019, 0],
          [150000, 2280, 0.0285, 120000],
          [360000, 3135, 0.038, 150000],
          [725000, 11115, 0.0475, 360000],
          [Infinity, 28453, 0.0515, 725000],
        ]),
      );
    case "TAS":
      return round(
        bracket(v, [
          [3000, 50, 0, 0],
          [25000, 50, 0.0175, 3000],
          [75000, 435, 0.0225, 25000],
          [200000, 1560, 0.035, 75000],
          [375000, 5935, 0.04, 200000],
          [725000, 12935, 0.0425, 375000],
          [Infinity, 27810, 0.045, 725000],
        ]),
      );
    case "ACT":
    case "NT":
      // ACT/NT use distinct formulas (ACT phasing out duty; NT has a quadratic band).
      // Fall back to a ~4.5% estimate; use Research for these for accuracy.
      return round(v * 0.045);
    default:
      return round(v * 0.045); // unknown state — rough national-average estimate
  }
}
