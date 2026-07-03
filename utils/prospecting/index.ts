/**
 * Region prospecting orchestrator.
 *
 * `scanRegion(region)` geocodes the region to a bounding box and dispatches to
 * the state scan. Only NSW is supported today (minimum lot size is the only
 * subdivision control published statewide as queryable data); other states
 * return supported=false with an explanatory note.
 */

import { geocodeRegion } from "./geocodeRegion";
import { scanNSW } from "./nsw";
import type { ScanResult } from "./types";

export type { Candidate, ScanResult } from "./types";

export async function scanRegion(
  region: string,
  opts: { minAreaSqm?: number; maxCandidates?: number } = {},
): Promise<ScanResult> {
  const trimmed = region.trim();
  const base: ScanResult = {
    region: trimmed,
    state: null,
    center: null,
    bbox: null,
    candidates: [],
    scanned: 0,
    notes: [],
    supported: false,
  };
  if (!trimmed) return { ...base, notes: ["Enter a region to scan."] };

  const geo = await geocodeRegion(trimmed);
  if (!geo) return { ...base, notes: ["That region could not be located — try a suburb, town or LGA name plus the state."] };

  if (geo.state !== "NSW") {
    return {
      ...base,
      state: geo.state,
      center: geo.center,
      bbox: geo.bbox,
      notes: [
        `Region combing currently supports NSW only — minimum lot size (needed to test subdivision) is the one subdivision control published statewide as data. ${geo.state ?? "This state"} needs per-council data, which is on the roadmap.`,
      ],
    };
  }

  const { candidates, scanned, notes } = await scanNSW(geo.bbox, opts);
  const clampNote = geo.clamped
    ? ["The region was large — scanned a ~27 km window around its centre. Search a tighter area (a suburb or town) for full coverage."]
    : [];

  return {
    region: trimmed,
    state: "NSW",
    center: geo.center,
    bbox: geo.bbox,
    candidates,
    scanned,
    notes: [...clampNote, ...notes],
    supported: true,
  };
}
