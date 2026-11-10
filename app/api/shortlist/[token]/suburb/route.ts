/**
 * GET /api/shortlist/<token>/suburb?suburb=&state= — PUBLIC, token-scoped.
 *
 * The suburb profile for one suburb ON THIS SHORTLIST: NEXUS suburb intel (when
 * enriched) plus the client-facing narrative the deal-analyser reports use
 * (utils/suburb-narrative.ts — AI + web search, NextKey-only, past performance
 * framing, cached 7 days per suburb).
 *
 * Only suburbs on the shortlist are accepted, so a token can't be used to run
 * AI research on arbitrary places. The narrative is scrubbed of any builder or
 * estate name before it leaves, in case the research surfaced one.
 */
import { NextResponse } from "next/server";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { redactSupplierNames } from "../../../../../utils/partner";
import { supplierNames } from "../../../../../utils/partner-stock";
import { getSuburbIntel } from "../../../../../utils/suburb-intel";
import { getSuburbNarrative } from "../../../../../utils/suburb-narrative";
import { loadClientShortlist, resolveShortlistToken } from "../../../../../utils/property-shortlist-db";
import { clientIp } from "../../../portal/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 20, keyFn: () => clientIp(req) });
  if (limited) return limited;

  const { token } = await params;
  const resolved = await resolveShortlistToken(token);
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });

  const url = new URL(req.url);
  const suburb = (url.searchParams.get("suburb") ?? "").trim().toLowerCase();
  const state = (url.searchParams.get("state") ?? "").trim().toUpperCase();

  let match: { suburb: string; state: string | null } | undefined;
  try {
    const shortlist = await loadClientShortlist(resolved.row);
    match = shortlist.suburbs.find((s) => s.suburb.toLowerCase() === suburb && (s.state ?? "") === state);
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't load this suburb. Please try again." }, { status: 500 });
  }
  if (!match) return NextResponse.json({ ok: false, error: "That suburb isn't on this shortlist." }, { status: 404 });

  const intel = await getSuburbIntel(match.suburb, match.state);
  const [narrative, names] = await Promise.all([
    getSuburbNarrative({ suburb: match.suburb, state: match.state, intel }),
    supplierNames(),
  ]);

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
      narrative: redactSupplierNames(narrative, names),
    },
    { headers: { "cache-control": "private, max-age=600" } },
  );
}
