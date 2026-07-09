/**
 * Types for the deterministic feasibility / yield engine (Phase 2).
 *
 * The engine consumes the normalised `SiteData` from `utils/planning` and a set
 * of overridable `FeasibilityAssumptions`, and returns yield + indicative
 * financials. It is state-agnostic: it only reads site area + planning controls,
 * so it works identically for NSW/VIC/QLD as long as those numbers are present.
 *
 * IMPORTANT: this is a quick desktop feaso — envelope is approximated from a
 * density-based site-coverage ratio (front/side/rear setbacks implied), NOT a
 * geometric setback offset. The true geometric envelope is Phase 3. All
 * financial outputs are indicative and depend on the assumptions used.
 */

export type DensityClass = "low" | "medium" | "high" | "rural" | "commercial" | "unknown";

export type FeasibilityAssumptions = {
  /** Floor-to-floor height, metres → storeys = floor(heightLimit / this). */
  storeyHeightM: number;
  /** Site coverage: building footprint ÷ site area (implies setbacks). */
  siteCoverage: number;
  /** Usable/efficiency factor applied to gross envelope (circulation, cores). */
  efficiency: number;
  /** Default storeys when no height control is available. */
  defaultStoreys: number;
  /** Average gross floor area per dwelling (m²) for this density. */
  avgDwellingGfaSqm: number;
  /** Build cost per m² of GFA (AUD). */
  constructionCostPerSqm: number;
  /** Indicative sale price per m² of sellable area (AUD) — placeholder, override with comps. */
  salePricePerSqmGfa: number;
  /** Professional fees as a fraction of construction cost. */
  professionalFeesPct: number;
  /** Contingency as a fraction of construction cost. */
  contingencyPct: number;
  /** Minimum site area (m²) at which a dual occupancy is worth testing. */
  dualOccMinSqm: number;
  /** Land acquisition cost (AUD) — the purchase price, if buying. */
  landAcquisitionCost?: number | null;
  /** Known sale price per completed dwelling (AUD) — overrides the per-m² basis. */
  salePricePerDwelling?: number | null;
};

export type Financials = {
  landCost: number | null;
  constructionCost: number;
  professionalFees: number;
  contingency: number;
  totalDevelopmentCost: number | null; // null when land cost unknown
  grossRealisation: number; // GRV (gross, incl. GST)
  netRealisation: number; // GRV net of GST (÷1.1, indicative margin-scheme proxy)
  profit: number | null;
  marginOnCostPct: number | null; // profit ÷ TDC
  indicative: true;
};

export type Scenario = {
  key: "subdivision" | "dual_occupancy" | "multi_dwelling";
  label: string;
  feasible: boolean;
  /** Number of lots (subdivision) or dwellings (dual-occ / multi-dwelling). */
  yield: number | null;
  detail: string;
  /** Financials for buildable scenarios (not vacant-lot subdivision). */
  financials?: Financials | null;
};

export type EnvelopeEstimate = {
  siteAreaSqm: number;
  storeys: number;
  footprintSqm: number; // site area × coverage
  maxGfaEnvelopeSqm: number; // footprint × storeys × efficiency
  fsrCapGfaSqm: number | null; // FSR × site area, if FSR present
  developableGfaSqm: number; // min(envelope, fsrCap)
  bindingConstraint: "height/coverage" | "FSR";
};

export type FeasibilityResult = {
  coverage: "full" | "partial" | "none";
  densityClass: DensityClass;
  envelope: EnvelopeEstimate | null;
  scenarios: Scenario[];
  assumptions: FeasibilityAssumptions;
  /** Short label/value pairs for keyStats-style display. */
  highlights: Array<{ label: string; value: string }>;
  notes: string[];
};
