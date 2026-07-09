/**
 * Default planning setbacks (metres) by density class.
 *
 * These are indicative AU defaults used to derive a buildable envelope for the
 * 3D massing. Real setbacks come from the DCP / scheme codes and vary by zone,
 * frontage and storey — the advisor should override them. Front/rear apply to
 * the two ends of the lot's long (depth) axis; side applies to both long edges.
 */

import type { DensityClass } from "../feasibility/types";

export type Setbacks = { front: number; rear: number; side: number };

const BY_DENSITY: Record<DensityClass, Setbacks> = {
  low: { front: 6, rear: 6, side: 1.5 },
  medium: { front: 4, rear: 4, side: 3 },
  high: { front: 6, rear: 6, side: 3 },
  rural: { front: 10, rear: 10, side: 5 },
  commercial: { front: 3, rear: 3, side: 0 },
  unknown: { front: 5, rear: 5, side: 2 },
};

export function defaultSetbacks(density: DensityClass, overrides: Partial<Setbacks> = {}): Setbacks {
  return { ...BY_DENSITY[density], ...overrides };
}
