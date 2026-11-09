/**
 * GET /api/partner/stock?state=&q=&minBeds=&minPrice=&maxPrice=&type=&available=1&sort=&page=&pageSize=
 *
 * PUBLIC (session-scoped). The shared stock book — the same for every partner —
 * masked by toPartnerLot: no builder, estate, lot number or address. See
 * utils/partner-stock.ts.
 */
import { NextResponse } from "next/server";
import { requirePartner, requireFeature, showsFees } from "../_shared";
import { applyStockFilters, loadPartnerStock, parseStockFilters } from "../../../../utils/partner-stock";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 96;

export async function GET(req: Request) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "stock");
  if (locked) return locked;

  const params = new URL(req.url).searchParams;
  const filters = parseStockFilters(params);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(params.get("pageSize")) || DEFAULT_PAGE_SIZE));
  const page = Math.max(1, Number(params.get("page")) || 1);

  try {
    const all = await loadPartnerStock({ showFees: showsFees(auth) });
    const lots = applyStockFilters(all, filters);
    // Facets come from the whole listable book, so choosing a state doesn't make
    // every other state vanish from its own dropdown.
    const listable = all.filter((l) => l.availability !== "unavailable");
    const states = [...new Set(listable.map((l) => l.state).filter(Boolean))].sort();
    const types = [...new Set(listable.map((l) => l.propertyType).filter(Boolean))].sort();

    return NextResponse.json({
      ok: true,
      total: lots.length,
      page,
      pageSize,
      lots: lots.slice((page - 1) * pageSize, page * pageSize),
      facets: { states, types },
      asAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[partner] stock load failed", e);
    return NextResponse.json(
      { ok: false, error: "Stock is unavailable right now. Please try again shortly." },
      { status: 503 },
    );
  }
}
