/**
 * Map a verified deal-packet property → PIA report inputs + market context.
 *
 * THE COMPLIANCE SPLIT (locked decision — see docs/FEATURE-deal-analyser.md §6):
 *  - The PIA *projection* runs on the conservative HOUSE growth assumptions
 *    (DEFAULT_INPUTS), NEVER the email body's recent past-growth figures.
 *    Projecting +13.9% forward would imply a future return the market hasn't
 *    promised — ACL s.18/29 misleading-conduct risk.
 *  - The body's strong historical numbers are carried separately in
 *    `MarketContext` for the report's *context* section, shown as SOURCED,
 *    DATED, PAST-performance only, with the mandatory disclaimers.
 *
 * So the client sees the genuine sourced market strength AND a projection that
 * is a clearly-labelled conservative assumption — the two never blur together.
 */
import { DEFAULT_INPUTS, type PiaInputs } from "../app/pia/_calc";
import type { DealPacketProperty, SourcedMetric, AssumptionSource } from "./deal-packet";

/** Default loan-to-value ratio when the operator hasn't set a loan amount. */
const DEFAULT_LVR = 0.8;

/**
 * Resolve a property's full PIA inputs: DEFAULT_INPUTS <- saved pia_inputs (operator
 * + AI-researched) <- canonical price/rent (specs.total_price / rent_basis), so edits
 * to price/rent via any path flow through. Before any assumptions are saved, growth
 * stays the conservative house default (compliance) and the loan defaults to 80% LVR.
 */
export function resolvePiaInputs(property: DealPacketProperty): PiaInputs {
  const { specs, rent_basis: rent, pia_inputs } = property;
  const base: PiaInputs = { ...DEFAULT_INPUTS, ...(pia_inputs ?? {}) };
  base.purchasePrice = specs?.total_price ?? base.purchasePrice;
  base.weeklyRent = rent.weekly_rent ?? base.weeklyRent;
  if (!pia_inputs) {
    base.capitalGrowth = FORWARD_ASSUMPTIONS.capitalGrowth;
    base.rentalGrowth = FORWARD_ASSUMPTIONS.rentalGrowth;
    base.loanAmount = Math.round(base.purchasePrice * DEFAULT_LVR);
  }
  return base;
}

/** Forward assumptions for the projection = conservative house defaults. */
export const FORWARD_ASSUMPTIONS = {
  capitalGrowth: DEFAULT_INPUTS.capitalGrowth, // 5% p.a. — long-run, not recent peak
  rentalGrowth: DEFAULT_INPUTS.rentalGrowth, // 3% p.a.
} as const;

/** Sourced, dated, PAST-performance market data — display-only, never projected. */
export interface MarketContext {
  historical_capital_growth_12m_pct: SourcedMetric | null;
  median_house_price: SourcedMetric | null;
  median_rent_pw: number | null;
  rental_yield_pct: number | null;
  vacancy_rate_pct: number | null;
  /** Past-performance / general-advice flags lifted from the packet's verify_flags. */
  disclaimers: string[];
}

export interface PiaMapping {
  /** Full, resolved PIA inputs ready to feed runPia(). */
  inputs: PiaInputs;
  marketContext: MarketContext;
  rent_source: "email_body" | "operator" | null;
  /** True when rent is absent (e.g. co-living) — block report generation + prompt the operator. */
  needs_rent_input: boolean;
  /** Human-readable trail of how inputs were derived (auditability). */
  notes: string[];
  /** AI-researched cost citations to surface in the report. */
  sources: AssumptionSource[];
}

export function dealPacketPropertyToPia(property: DealPacketProperty): PiaMapping {
  const { specs, market, rent_basis: rent } = property;
  const inputs = resolvePiaInputs(property);
  const notes: string[] = [];

  notes.push(
    `Forward capital growth = ${inputs.capitalGrowth}% p.a.${property.pia_inputs ? "" : " (conservative house default; the body's past-growth figure is shown in context only, not projected)"}.`,
  );
  if (specs?.is_co_living) {
    notes.push(
      `Co-living: weeklyRent is the GROSS total across ${specs.bedrooms ?? "?"} rooms` +
        `${rent.source === "operator" ? " (operator-supplied)" : ""}.`,
    );
  }
  if (rent.weekly_rent == null) {
    notes.push("Weekly rent not set — projection is NOT valid until the operator supplies a figure.");
  }
  for (const s of property.pia_sources ?? []) {
    notes.push(`${s.label} = ${s.value} (sourced: ${s.source}, ${s.date}).`);
  }

  const marketContext: MarketContext = {
    historical_capital_growth_12m_pct: market?.capital_growth_12m_pct ?? null,
    median_house_price: market?.median_house_price ?? null,
    median_rent_pw: market?.median_rent_pw ?? null,
    rental_yield_pct: market?.rental_yield_pct ?? null,
    vacancy_rate_pct: market?.vacancy_rate_pct ?? null,
    disclaimers: property.verify_flags.filter((f) => /disclaimer|past[\s-]?performance/i.test(f)),
  };

  return {
    inputs,
    marketContext,
    rent_source: rent.source,
    needs_rent_input: rent.weekly_rent == null,
    notes,
    sources: property.pia_sources ?? [],
  };
}
