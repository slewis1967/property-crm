/**
 * Deal-packet — the contract between extraction (NEXUS) and report generation (CRM).
 *
 * NEXUS extracts/verifies an inbound property-package email into a DealPacket and
 * writes it to the `deal_packets` Supabase table (see docs/FEATURE-deal-analyser.md
 * for the DDL). The CRM reads it to render the rent-input prompt and the PIA /
 * comparison reports.
 *
 * Guiding rule: nothing is fabricated. Every figure carries its source; missing
 * rent yields `status: "needs_rent_input"` rather than a guessed number; internal
 * figures (commission) are captured in `redactions`, never inside a property.
 */

/** Lifecycle of a packet from extraction to reports. */
export type DealPacketStatus =
  | "extracting"        // NEXUS is still reading the email/PDFs
  | "needs_rent_input"  // a (co-living) property has no usable rent — prompt the operator
  | "ready"             // verified, all inputs present — reports can be generated
  | "reports_generated" // PIA + comparison reports written to pia_reports
  | "failed";           // extraction/verification could not complete

/** A numeric metric that may have been quoted by multiple disagreeing sources. */
export interface SourcedMetric {
  /** The single value the analysis uses (mean/midpoint/most-credible). Null if unknown. */
  reconciled: number | null;
  /** Each source as quoted in the email body, e.g. { source: "Barry Plant", value: 675000 }. */
  sources: { source: string; value: number }[];
  /** True when sources differ materially — surface the range to the client, don't hide it. */
  variance_flag: boolean;
}

/** Package specifics extracted from the flyer PDF (Claude vision). */
export interface PropertySpecs {
  total_price: number | null;
  land_price: number | null;
  build_price: number | null;
  land_size_m2: number | null;
  house_size_m2: number | null;
  estate: string | null;
  house_design: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  car_spaces: number | null;
  living_areas: number | null;
  /** True only when the flyer carries a co-living tag OR the operator confirms the config. */
  is_co_living: boolean;
  key_inclusions: string[];
  /** Supabase Storage paths for floorplan/render images pulled from the flyer (pages 2+). */
  image_paths: string[];
}

/** Suburb/market thesis extracted from the email body. */
export interface MarketData {
  capital_growth_12m_pct: SourcedMetric;
  median_house_price: SourcedMetric;
  median_rent_pw: number | null;
  rental_yield_pct: number | null;
  vacancy_rate_pct: number | null;
  population: number | null;
  population_growth_pct: number | null;
  household_income_growth_pct: number | null;
}

/** The rent basis the PIA cashflow is built on — body-sourced or operator-supplied. */
export interface RentBasis {
  /** GROSS weekly rent. For co-living this is room_rent × rooms. */
  weekly_rent: number | null;
  /** True for co-living (rent is per-room × rooms); false for single-tenancy. */
  per_room: boolean;
  rooms: number | null;
  /** Per-room weekly rent (co-living only) — kept for provenance + the report's income callout. */
  room_rent?: number | null;
  /** Where the figure came from. Operator entries are attributed as a NextKey estimate. */
  source: "email_body" | "operator" | null;
}

export interface DealPacketProperty {
  suburb: string | null;
  address: string | null;
  specs: PropertySpecs | null;
  market: MarketData | null;
  rent_basis: RentBasis;
  /** Investment thesis bullet points lifted/normalised from the body. */
  thesis_points: string[];
  /**
   * Human-readable verification notes: source disagreements, mandatory
   * past-performance disclaimers, price-math result, co-living-without-tag, etc.
   * Anything saying "disclaimer required" MUST be honoured in the rendered report.
   */
  verify_flags: string[];
}

export interface DealPacket {
  properties: DealPacketProperty[];
  /** Internal/commercial figures stripped from the email (e.g. commission) — never client-facing. */
  redactions: string[];
  status: DealPacketStatus;
}
