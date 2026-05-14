/**
 * GET /api/pia/properties?q=X&limit=N
 *   Lists properties from global_stock_pool suitable for picking into a PIA
 *   report. Filters out legacy + withdrawn rows. Optional text search across
 *   suburb / state / street / builder / estate.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { orSafe } from "../../../../utils/postgrest-safe";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  let query = supabase
    .from("global_stock_pool")
    .select(
      "id,builder_name,estate_name,lot_number,street_address,suburb,state,total_package_price,land_price,build_price,house_price,expected_rent_weekly,bedrooms,bathrooms,car_spaces,land_size_sqm,pipeline_status",
    )
    .neq("pipeline_status", "withdrawn")
    .neq("pipeline_status", "legacy")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (q) {
    const safe = orSafe(q);
    if (safe) {
      query = query.or(
        `suburb.ilike.%${safe}%,state.ilike.%${safe}%,street_address.ilike.%${safe}%,builder_name.ilike.%${safe}%,estate_name.ilike.%${safe}%`,
      );
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, properties: data ?? [] });
}
