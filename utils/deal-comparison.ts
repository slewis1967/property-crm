/**
 * Deal comparison + 1–10 investment-merit rating.
 *
 * Compliance note: the score is NextKey's GENERAL assessment of a property's
 * investment merits, built from FACTUAL metrics (yield, land, vacancy, price,
 * co-living income structure) — not a promise of return and not personal advice.
 * Every point is traceable to a shown factor, so the rating is explainable, not
 * a black box. The comparison report must carry the general-advice disclaimer.
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

/**
 * Factor rubric (max 10 pts). Weights favour the levers that actually drive
 * investor return for this product set; yield dominates, co-living adds income
 * resilience, land proxies long-run growth.
 */
function scoreOne(p: ComparisonInput): ScoredProperty {
  const factors: ScoreFactor[] = [];

  // Rental yield — the dominant ROI lever (0–4). 8%+ gross = full marks.
  const yld = p.grossYield ?? 0;
  factors.push({ label: "Rental yield", detail: `${yld}% gross`, points: round1(clamp((yld / 8) * 4, 0, 4)), max: 4 });

  // Co-living — multiple income streams from one home (0–1.5).
  factors.push({
    label: "Income structure",
    detail: p.is_co_living ? `Co-living · ${p.rooms ?? "?"} income streams` : "Single tenancy",
    points: p.is_co_living ? 1.5 : 0,
    max: 1.5,
  });

  // Land size — long-run growth proxy (0–2). 650m²+ = full marks.
  const land = p.land_size_m2 ?? 0;
  factors.push({ label: "Land (growth potential)", detail: land ? `${land} m²` : "—", points: round1(clamp((land / 650) * 2, 0, 2)), max: 2 });

  // Rental demand via vacancy (0–1.5). Tighter vacancy = stronger demand. Unknown → neutral.
  const vac = p.vacancy_rate_pct;
  const vacPts = vac == null ? 0.75 : round1(clamp(((3 - vac) / 3) * 1.5, 0, 1.5));
  factors.push({ label: "Rental demand", detail: vac == null ? "vacancy n/a" : `${vac}% vacancy`, points: vacPts, max: 1.5 });

  // Entry accessibility (0–1). Lower entry price scores slightly higher.
  const price = p.price ?? 0;
  factors.push({ label: "Entry price", detail: price ? `$${price.toLocaleString("en-AU")}` : "—", points: round1(clamp((850000 - price) / 350000, 0, 1)), max: 1 });

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
      "Ratings are NextKey's general assessment of each property's investment merits based on the factual metrics shown — not personal advice and not a forecast or guarantee of return.",
      "Yield and growth figures are estimates/historical data as labelled; past performance is not indicative of future results.",
      "Seek your own independent financial, legal and taxation advice before deciding.",
    ],
  };
}
