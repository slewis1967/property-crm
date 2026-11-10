/**
 * Transfer (stamp) duty by state — extracted from WarRoomCalculators so the
 * borrowing calculator can net duty out of the deposit without importing a
 * client component. Simplified 2026 indicative brackets; verify with the
 * relevant state revenue office before contract.
 */

export type AusState = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "ACT" | "TAS" | "NT";

export const AUS_STATES: AusState[] = ["NSW", "VIC", "QLD", "WA", "SA", "ACT", "TAS", "NT"];

/** Standard duty (non-FHB). Brackets are [upper-bound, base, rate-on-excess-over-prev]. */
export function standardDuty(state: AusState, price: number): number {
  if (price <= 0) return 0;
  const brackets: Record<AusState, [number, number, number][]> = {
    NSW: [
      [16000, 0, 0.0125],
      [35000, 200, 0.015],
      [97000, 485, 0.0175],
      [364000, 1570, 0.035],
      [1212000, 10915, 0.045],
      [Infinity, 49075, 0.055],
    ],
    VIC: [
      [25000, 0, 0.014],
      [130000, 350, 0.024],
      [960000, 2870, 0.06],
      [Infinity, 52670, 0.065],
    ],
    QLD: [
      [5000, 0, 0],
      [75000, 0, 0.015],
      [540000, 1050, 0.035],
      [1000000, 17325, 0.045],
      [Infinity, 38025, 0.0575],
    ],
    WA: [
      [120000, 0, 0.019],
      [150000, 2280, 0.0285],
      [360000, 3135, 0.0375],
      [725000, 11115, 0.0475],
      [Infinity, 28453, 0.0515],
    ],
    SA: [
      [12000, 0, 0.01],
      [30000, 120, 0.02],
      [50000, 480, 0.03],
      [100000, 1080, 0.035],
      [200000, 2830, 0.04],
      [250000, 6830, 0.0425],
      [300000, 8955, 0.0475],
      [500000, 11330, 0.05],
      [Infinity, 21330, 0.055],
    ],
    ACT: [
      [200000, 0, 0.0149],
      [300000, 2980, 0.027],
      [500000, 5680, 0.0316],
      [750000, 13580, 0.0411],
      [1000000, 23855, 0.0497],
      [1455000, 36280, 0.0573],
      [Infinity, 62402, 0.07],
    ],
    TAS: [
      [3000, 0, 0],
      [25000, 50, 0.0175],
      [75000, 435, 0.0225],
      [200000, 1560, 0.035],
      [375000, 5935, 0.04],
      [725000, 12935, 0.0425],
      [Infinity, 27810, 0.045],
    ],
    NT: [
      [Infinity, 0, 0.04949], // simplified flat-ish — NT uses a complex formula
    ],
  };
  const table = brackets[state];
  let prevUpper = 0;
  for (const [upper, base, rate] of table) {
    if (price <= upper) return base + (price - prevUpper) * rate;
    prevUpper = upper;
  }
  return 0;
}

// FHB concession thresholds — 2026 indicative
export const FHB_FULL_CAP: Record<AusState, number> = {
  NSW: 800000,
  VIC: 600000,
  QLD: 700000,
  WA: 530000,
  SA: 650000,
  ACT: 1000000, // ACT income-tested; cap shown is approximate property cap for new builds
  TAS: 600000,
  NT: 650000,
};
export const FHB_PARTIAL_CAP: Record<AusState, number> = {
  NSW: 1000000,
  VIC: 750000,
  QLD: 800000,
  WA: 601000,
  SA: 700000,
  ACT: 1455000,
  TAS: 750000,
  NT: 750000,
};

export function fhbDuty(state: AusState, price: number): number {
  if (price <= FHB_FULL_CAP[state]) return 0;
  if (price >= FHB_PARTIAL_CAP[state]) return standardDuty(state, price);
  // Linear taper between full cap (0 duty) and partial cap (full duty)
  const standard = standardDuty(state, price);
  const taper =
    (price - FHB_FULL_CAP[state]) / (FHB_PARTIAL_CAP[state] - FHB_FULL_CAP[state]);
  return standard * taper;
}

/** Duty payable given FHB status. */
export function dutyPayable(state: AusState, price: number, isFhb: boolean): number {
  return isFhb ? fhbDuty(state, price) : standardDuty(state, price);
}
