/**
 * GET /api/properties/map
 *
 * Active stock rolled up to one cluster per suburb, for the Stock Map.
 *
 * global_stock_pool has no coordinates and only ~4% of rows carry a street
 * address, so the unit of the map is the SUBURB, not the property. Centroids
 * come from the `stock_geocodes` cache (utils/geo/suburbs.ts); anything not yet
 * cached is returned in `unlocated` so the page can say what it couldn't place
 * instead of silently dropping it.
 *
 * Filters mirror /api/properties/list exactly, so the map and the feed always
 * describe the same set of stock.
 *
 * Returns:
 *   { ok, clusters[], unlocated[], total, located, needsGeocode, tableMissing }
 *
 * Auth: the sentinel pattern used by the other list endpoints — an unauth
 * caller gets a 401, not a map of every property we hold.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../utils/cf-access";
import { withObservability } from "../../../../utils/observability";
import { log, errInfo } from "../../../../utils/logger";
import { readCache } from "../../../../utils/geo/suburbs";
import { buildClusters, distinctKeys, type StockRow } from "../../../../utils/geo/clusters";

export const dynamic = "force-dynamic";

// The map genuinely needs the whole matching set — a map that silently shows
// 1,000 of 1,481 properties is worse than no map. This bounds the work if the
// pool ever grows unexpectedly.
const MAP_ROW_CAP = 8000;

// PostgREST caps any single response at its configured max-rows (1,000 on
// Supabase) NO MATTER what .limit() asks for, so the fetch has to page with
// .range() to get past it. This bit us: an unpaged .limit(5000) returned
// exactly 1,000 rows and the map quietly lost the other 481.
const PAGE = 1000;

function num(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function handler(req: Request) {
  const sender = await userEmailFromRequest(req);
  if (sender === "__unauthenticated__@invalid") {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const builder = sp.get("builder")?.trim() || null;
  const state = sp.get("state")?.trim() || null;
  const type = sp.get("type")?.trim() || null;
  const q = sp.get("q")?.trim() || null;
  const priceMin = num(sp.get("priceMin"));
  const priceMax = num(sp.get("priceMax"));
  const bedsMin = num(sp.get("bedsMin"));

  // Only the columns the map and its drill-down panel render. Deliberately
  // narrow: brochure_url / ocr_text / embedding would multiply the payload for
  // no benefit here.
  const COLS =
    "id,builder_name,estate_name,lot_number,street_address,suburb,state," +
    "property_type,bedrooms,bathrooms,car_spaces,land_size,titled," +
    "house_price,total_package_price";

  // Rebuilt per page: a PostgrestFilterBuilder is a thenable that can only be
  // awaited once, so the filter chain can't be shared across .range() calls.
  const buildQuery = (from: number, to: number) => {
    let query = supabase
      .from("global_stock_pool")
      .select(COLS)
      .neq("pipeline_status", "withdrawn")
      .neq("pipeline_status", "legacy");

    if (builder) query = query.eq("builder_name", builder);
    if (state) query = query.eq("state", state);
    if (type) query = query.eq("property_type", type);
    if (priceMin != null) query = query.gte("total_package_price", priceMin);
    if (priceMax != null) query = query.lte("total_package_price", priceMax);
    if (bedsMin != null) query = query.gte("bedrooms", bedsMin);
    if (q) {
      const like = `%${q.replace(/[%,()]/g, " ")}%`;
      query = query.or(
        `suburb.ilike.${like},builder_name.ilike.${like},estate_name.ilike.${like},` +
          `street_address.ilike.${like},lot_number.ilike.${like}`,
      );
    }
    // A stable order is required for .range() paging to be coherent — without
    // it Postgres may return rows in a different order per page and the fetch
    // can both duplicate and miss rows.
    return query.order("id", { ascending: true }).range(from, to);
  };

  const rows: StockRow[] = [];
  for (let from = 0; from < MAP_ROW_CAP; from += PAGE) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error) {
      log.error("properties.map.query_failed", errInfo(error));
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const batch = (data ?? []) as unknown as StockRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  const keys = distinctKeys(rows);
  const { points, failed, tableMissing } = await readCache(keys);
  const { clusters, unlocated } = buildClusters(rows, points, failed);

  const located = clusters.reduce((n, c) => n + c.count, 0);
  // Suburbs we've never tried — the "Locate N suburbs" button acts on these.
  // A cached failure is excluded: retrying it just burns the rate limit.
  const needsGeocode = unlocated
    .filter((u) => u.reason === "not-geocoded" && u.key)
    .map((u) => u.key as string);

  return NextResponse.json({
    ok: true,
    clusters,
    unlocated,
    total: rows.length,
    located,
    needsGeocode,
    tableMissing,
  });
}

export const GET = withObservability("GET /api/properties/map", handler);
