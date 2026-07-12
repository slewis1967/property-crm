import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/utils/supabase";
import { requireAuth } from "@/utils/cf-access";
import { orSafe } from "@/utils/postgrest-safe";

/**
 * GET /api/deal-analyser/stock-search?q=...
 *
 * Search the aggregator stock (global_stock_pool) so the operator can pull an
 * existing listing into a deal packet to benchmark against. Lean payload — enough
 * to pick from; the full row is read server-side when it's actually added.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  let query = supabase
    .from("global_stock_pool")
    .select("id, builder_name, street_address, suburb, state, total_package_price, house_price, bedrooms, bathrooms")
    .limit(20);
  if (q) {
    const safe = orSafe(q);
    if (safe) query = query.or(`suburb.ilike.%${safe}%,street_address.ilike.%${safe}%,builder_name.ilike.%${safe}%`);
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (data ?? []).map((r: {
    id?: string | null;
    builder_name?: string | null;
    street_address?: string | null;
    suburb?: string | null;
    state?: string | null;
    total_package_price?: number | null;
    house_price?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
  }) => ({
    id: r.id,
    label: [r.street_address, r.suburb, r.state].filter(Boolean).join(", ") || r.builder_name || "Listing",
    price: r.total_package_price ?? r.house_price ?? null,
    beds: r.bedrooms ?? null,
    baths: r.bathrooms ?? null,
    builder: r.builder_name ?? null,
  }));
  return NextResponse.json({ ok: true, results });
}
