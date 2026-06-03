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
  coercePageSize,
  paginate,
} from "../../../../utils/pagination";
import { log, errInfo } from "../../../../utils/logger";

export const dynamic = "force-dynamic";

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
  const pageSize = coercePageSize(url.searchParams.get("pageSize"));

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from("global_stock_pool")
    .select(
      // Same column projection page.tsx used to fetch all of; the
      // * removed the unused PII/financial fields the property
      // detail page owns.
      "id,builder_name,estate_name,lot_number,street_address,suburb,state,postcode," +
        "property_type,bedrooms,bathrooms,car_spaces,land_size,house_size," +
        "land_price,build_price,house_price,total_package_price," +
        "status,pipeline_status,titled,created_at,updated_at," +
        "brochure_url,description,confidence_score",
      { count: "exact" },
    )
    .neq("pipeline_status", "withdrawn")
    .neq("pipeline_status", "legacy")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    log.error("properties.list.query_failed", errInfo(error));
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Normalise field names so PropertyGrid's `??` fallbacks line up
  // with the snake_case columns Supabase returns. Mirrors page.tsx.
  const rows = (data ?? []).map((p: any) => ({
    ...p,
    price_total: p.total_package_price ?? p.house_price ?? p.price_total,
    address_street: p.street_address ?? p.address_street,
    address_suburb: p.suburb ?? p.address_suburb,
    address_state: p.state ?? p.address_state,
    image_url: p.brochure_url ?? p.image_url,
  }));

  return NextResponse.json(paginate(rows, page, pageSize, count ?? 0));
}

export const GET = withObservability("GET /api/properties/list", handler);
