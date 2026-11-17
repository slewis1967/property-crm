/**
 * GET /api/partner/suburbs/report?suburb=&state= — a suburb research report for
 * a suburb in the stock book (Professional and Enterprise: `suburb_reports`).
 *
 * PUBLIC (session-scoped). NEXUS suburb intel when it has the suburb, plus the
 * AI + web-search profile (utils/suburb-narrative.ts) in its brand-NEUTRAL form,
 * cached a week per suburb. Then every builder/estate name we know and our own
 * name are scrubbed out: the report goes to the partner's client under the
 * partner's name, and research can surface an estate's name.
 *
 * Only suburbs with stock are accepted (findStockSuburb), so the AI spend is
 * bounded by the stock book, not by what a caller types. First generation for a
 * suburb takes ~20–40s; repeat views are cached.
 */
import { NextResponse } from "next/server";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { redactSupplierNames } from "../../../../../utils/partner";
import { loadPartnerStock, supplierNames } from "../../../../../utils/partner-stock";
import { OUR_BRAND_NAMES, findStockSuburb, stockSuburbs } from "../../../../../utils/partner-suburbs";
import { getSuburbIntel } from "../../../../../utils/suburb-intel";
import { getSuburbNarrative } from "../../../../../utils/suburb-narrative";
import { logPartnerEvent, requireFeature, requirePartner } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "suburb_reports");
  if (locked) return locked;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 10, keyFn: () => `partner-suburb:${auth.partnerId}` });
  if (limited) return limited;

  const url = new URL(req.url);
  const match = findStockSuburb(
    stockSuburbs(await loadPartnerStock({ showFees: false })),
    url.searchParams.get("suburb"),
    url.searchParams.get("state"),
  );
  if (!match) {
    return NextResponse.json({ ok: false, error: "We only research suburbs where we have stock." }, { status: 404 });
  }

  const intel = await getSuburbIntel(match.suburb, match.state);
  const [narrative, names] = await Promise.all([
    getSuburbNarrative({ suburb: match.suburb, state: match.state, intel, audience: "neutral" }),
    supplierNames(),
  ]);

  await logPartnerEvent({
    partnerId: auth.partnerId,
    actorType: "partner",
    actor: auth.email,
    action: "suburb_report_opened",
    detail: { suburb: match.suburb, state: match.state, generated: Boolean(narrative) },
  });

  return NextResponse.json(
    {
      ok: true,
      suburb: match.suburb,
      state: match.state,
      intel: intel
        ? {
            medianPrice: intel.median_price,
            priceGrowthPct: intel.price_growth_pct,
            population: intel.population,
            keyInfrastructure: intel.key_infrastructure,
            lastUpdated: intel.last_updated,
          }
        : null,
      narrative: redactSupplierNames(narrative, [...names, ...OUR_BRAND_NAMES]),
    },
    { headers: { "cache-control": "private, max-age=600" } },
  );
}
