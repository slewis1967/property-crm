/**
 * Deal comparison + 1–10 investment-merit rating.
 *
 * Compliance note: the score is NextKey's GENERAL assessment of investment merits,
 * built from the property's own MODELLED PIA figures (projected return/IRR, net
 * yield, cashflow) plus factual structural metrics (income structure, land, price).
 * It is not a promise of return and not personal advice. Every point is traceable to
 * a shown factor. The modelled figures use the conservative growth assumptions baked
 * into the PIA — the comparison report must carry the general-advice disclaimer.
 */

export interface ComparisonInput {
  suburb: string | null;
  address: string | null;
  grossYield: number | null; // %
  netYield: number | null; // %
  price: number | null;
  land_size_m2: number | null;
  is_co_living: boolean;
  rooms: number | null;
  weekly_rent: number | null;
  vacancy_rate_pct: number | null;
  // Modelled PIA outputs (drive the score):
  irr: number | null; // % p.a. (irrApprox)
  totalReturn: number | null; // $ over the hold
  netCashOverHolding: number | null; // $
  endEquity: number | null; // $
  breakevenYear: number | null; // first cashflow-positive year (null = never within term)
  holdingYears: number | null;
}

export interface ScoreFactor {
  label: string;
  detail: string;
  points: number; // contribution to the /10 score
  max: number;
}

export interface ScoredProperty extends ComparisonInput {
  score: number; // 1–10
  factors: ScoreFactor[];
}

export interface DealComparison {
  properties: ScoredProperty[]; // sorted best → worst
  recommendation: { suburb: string | null; address: string | null; score: number; why: string[] } | null;
  disclaimers: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const AUD = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

/**
 * Factor rubric (max 10 pts). Driven by the property's modelled PIA figures: the
 * projected return (IRR) leads, then after-cost net yield and cashflow timing —
 * the things that actually determine investor outcome — with income structure,
 * land and entry price as supporting factors.
 */
function scoreOne(p: ComparisonInput): ScoredProperty {
  const factors: ScoreFactor[] = [];

  // Projected return (IRR) — the headline modelled return on cash invested (0–3). 12%+ = full.
  const irr = p.irr ?? 0;
  factors.push({
    label: "Projected return",
    detail: p.irr != null ? `${irr}% p.a. (modelled IRR)` : "—",
    points: round1(clamp((irr / 12) * 3, 0, 3)),
    max: 3,
  });

  // Net rental yield — income after operating costs (0–2). 6%+ net = full.
  const net = p.netYield ?? 0;
  factors.push({ label: "Net rental yield", detail: p.netYield != null ? `${net}% net` : "—", points: round1(clamp((net / 6) * 2, 0, 2)), max: 2 });

  // Cashflow strength — how soon it's cashflow-positive (0–1.5). Sooner = less holding cost.
  const be = p.breakevenYear;
  const bePts = be == null ? 0 : round1(clamp(1.5 - (be - 1) * 0.2, 0, 1.5));
  factors.push({
    label: "Cashflow strength",
    detail: be == null ? "negative cashflow over term" : be <= 1 ? "cashflow-positive from year 1" : `cashflow-positive year ${be}`,
    points: bePts,
    max: 1.5,
  });

  // Income resilience — co-living = multiple income streams (0–1).
  factors.push({
    label: "Income structure",
    detail: p.is_co_living ? `Co-living · ${p.rooms ?? "?"} income streams` : "Single tenancy",
    points: p.is_co_living ? 1 : 0,
    max: 1,
  });

  // Land — long-run growth proxy (0–1.5). 650m²+ = full.
  const land = p.land_size_m2 ?? 0;
  factors.push({ label: "Land (growth potential)", detail: land ? `${land} m²` : "—", points: round1(clamp((land / 650) * 1.5, 0, 1.5)), max: 1.5 });

  // Entry accessibility (0–1). Lower entry price scores slightly higher.
  const price = p.price ?? 0;
  factors.push({ label: "Entry price", detail: price ? AUD(price) : "—", points: round1(clamp((850000 - price) / 350000, 0, 1)), max: 1 });

  const total = clamp(round1(factors.reduce((s, f) => s + f.points, 0)), 1, 10);
  return { ...p, score: total, factors };
}

export function buildComparison(items: ComparisonInput[]): DealComparison {
  const scored = items.map(scoreOne).sort((a, b) => b.score - a.score);
  const top = scored[0] ?? null;

  let recommendation: DealComparison["recommendation"] = null;
  if (top) {
    const why = top.factors
      .filter((f) => f.points >= f.max * 0.6) // the factors that carried it
      .map((f) => `${f.label}: ${f.detail}`);
    recommendation = { suburb: top.suburb, address: top.address, score: top.score, why };
  }

  return {
    properties: scored,
    recommendation,
    disclaimers: [
      "Ratings are NextKey's general assessment of each property's investment merits, built from its modelled PIA figures and the factual metrics shown — not personal advice and not a forecast or guarantee of return.",
      "Projected return, net yield and cashflow are modelled on conservative growth assumptions; actual results will differ and past performance is not indicative of future results.",
      "Seek your own independent financial, legal and taxation advice before deciding.",
    ],
  };
}
