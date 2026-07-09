import type { StateCode } from "../planning/types";
import type { Bbox } from "../planning/arcgis";

/** A parcel identified in a region scan as having subdivision headroom. */
export type Candidate = {
  lotPlan: string | null;
  lot: string | null;
  plan: string | null;
  areaSqm: number;
  minLotSqm: number;
  estLots: number; // floor(area / minLot)
  extraLots: number; // estLots - 1 (net new lots)
  zoneCode: string | null;
  zoneDescription: string | null;
  lga: string | null;
  center: { lng: number; lat: number };
  note?: string;
};

export type ScanResult = {
  region: string;
  state: StateCode | null;
  center: { lng: number; lat: number } | null;
  bbox: Bbox | null;
  candidates: Candidate[];
  scanned: number; // parcels examined
  notes: string[];
  /** Whether region combing is available for this state (NSW only, for now). */
  supported: boolean;
};
