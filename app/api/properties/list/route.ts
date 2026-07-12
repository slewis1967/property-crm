/**
 * GET /api/properties/list?page=N&pageSize=M
 *
 * Paginated list of active stock for the Aggregator Feed.
 *
 * Why this exists:
 *   The Aggregator Feed previously server-rendered every active row
 *   (select("*") on global_stock_pool) into the RSC payload — fine for
 *   the first 200, but with brochure URLs + full text blobs the cold
 *   start was visibly slow. This endpoint serves the first page from
 *   the server component and the rest via "Load more" calls.
 *
 * Filters mirror page.tsx's old server-side filter so withdrawn/legacy
 * rows stay hidden:
 *   - pipeline_status NOT IN ('withdrawn','legacy')
 *
 * Returns:
 *   { rows: PropertyGridItem[], page, pageSize, total, hasMore }
 *
 * Auth: the sentinel pattern. Unauth callers get a 401, not a leaked
 * page of stock — same shape the rest of the CRM uses.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../utils/cf-access";
import { withObservability } from "../../../../utils/observability";
import {
  coercePage,
  coercePropertiesPageSize,
  paginate,
} from "../../../../utils/pagination";
import { interleaveByBuilder } from "../../../../utils/feed-order";
import { log, errInfo } from "../../../../utils/logger";

export const dynamic = "force-dynamic";

// Cap for the interleave path — we fetch all matching rows, round-robin them
// across builders, then slice the page. The active feed is a few hundred rows;
// this bounds the work if it ever grows unexpectedly.
const INTERLEAVE_CAP = 3000;

function num(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function handler(req: Request) {
  // Sentinel auth — same pattern the rest of the CRM uses for
  // list endpoints. A request without a Cloudflare Access email
  // header is treated as anonymous rather than served real data.
  const sender = await userEmailFromRequest(req);
  if (sender === "__unauthenticated__@invalid") {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = coercePage(url.searchParams.get("page"));
  const pageSize = coercePropertiesPageSize(url.searchParams.get("pageSize"));
  const sp = url.searchParams;

  // Server-side filters — so the Builder dropdown (and the rest) query the whole
  // database instead of only the rows already loaded on screen. Categorical +
  // range filters are applied here; the client still refines by the bucketed
  // contract/status/titled filters on the returned set.
  const builder = sp.get("builder")?.trim() || null;
  const q = sp.get("q")?.trim() || null;
  const state = sp.get("state")?.trim() || null;
  const type = sp.get("type")?.trim() || null;
  const priceMin = num(sp.get("priceMin"));
  const priceMax = num(sp.get("priceMax"));
  const bedsMin = num(sp.get("bedsMin"));
  const bathsMin = num(sp.get("bathsMin"));
  const carsMin = num(sp.get("carsMin"));

  const COLS =
    "id,builder_name,estate_name,lot_number,street_address,suburb,state," +
    "property_type,bedrooms,bathrooms,car_spaces,land_size,house_size," +
    "land_price,build_price,house_price,total_package_price," +
    "status,pipeline_status,titled,created_at,updated_at," +
    "brochure_url,confidence_score";

  let query = supabase
    .from("global_stock_pool")
    .select(COLS, { count: "exact" })
    .neq("pipeline_status", "withdrawn")
    .neq("pipeline_status", "legacy");

  if (builder) query = query.eq("builder_name", builder);
  if (state) query = query.eq("state", state);
  if (type) query = query.eq("property_type", type);
  if (priceMin != null) query = query.gte("total_package_price", priceMin);
  if (priceMax != null) query = query.lte("total_package_price", priceMax);
  if (bedsMin != null) query = query.gte("bedrooms", bedsMin);
  if (bathsMin != null) query = query.gte("bathrooms", bathsMin);
  if (carsMin != null) query = query.gte("car_spaces", carsMin);
  if (q) {
    const like = `%${q.replace(/[%,()]/g, " ")}%`;
    query = query.or(
      `suburb.ilike.${like},builder_name.ilike.${like},estate_name.ilike.${like},` +
        `street_address.ilike.${like},lot_number.ilike.${like}`,
    );
  }

  type PropertyListRow = {
    builder_name?: string | null;
    total_package_price?: number | null;
    house_price?: number | null;
    price_total?: number | null;
    street_address?: string | null;
    address_street?: string | null;
    suburb?: string | null;
    address_suburb?: string | null;
    state?: string | null;
    address_state?: string | null;
    brochure_url?: string | null;
    image_url?: string | null;
  };
  const normalise = (p: PropertyListRow) => ({
    ...p,
    price_total: p.total_package_price ?? p.house_price ?? p.price_total,
    address_street: p.street_address ?? p.address_street,
    address_suburb: p.suburb ?? p.address_suburb,
    address_state: p.state ?? p.address_state,
    image_url: p.brochure_url ?? p.image_url,
  });

  // When a single builder is selected there is nothing to interleave, so keep
  // the fast DB-paginated newest-first path. Otherwise fetch the matching set,
  // round-robin it across builders (so no bulk import dominates the feed), then
  // slice the requested page.
  if (builder) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) {
      log.error("properties.list.query_failed", errInfo(error));
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const rows = ((data ?? []) as unknown as PropertyListRow[]).map(normalise);
    return NextResponse.json(paginate(rows, page, pageSize, count ?? 0));
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(INTERLEAVE_CAP);
  if (error) {
    log.error("properties.list.query_failed", errInfo(error));
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const all = interleaveByBuilder(((data ?? []) as unknown as PropertyListRow[]).map(normalise));
  const from = (page - 1) * pageSize;
  const pageRows = all.slice(from, from + pageSize);
  return NextResponse.json(paginate(pageRows, page, pageSize, all.length));
}

export const GET = withObservability("GET /api/properties/list", handler);
