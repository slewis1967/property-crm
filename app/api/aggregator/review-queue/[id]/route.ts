/**
 * Review queue item — approve / reject / edit.
 *
 *   POST /api/aggregator/review-queue/{id}
 *     Body: { action: "approve" | "reject", edited_extraction?, reason? }
 *
 *   "approve":
 *     Inserts into global_stock_pool with pipeline_status='active' (human-approved
 *     so confidence becomes 1.0). Marks queue row as 'approved'.
 *     edited_extraction overrides any fields from raw_extraction before publish.
 *
 *   "reject":
 *     Marks queue row as 'rejected'. Does not touch global_stock_pool.
 *     reason is appended to reasons[] for audit.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";

import { requireAuth } from "../../../../../utils/cf-access";
export const dynamic = "force-dynamic";

// total_package_price is a Postgres generated column (computed from
// house_price + land_price). Trying to INSERT it raises 428C9. We let
// Postgres compute it from the price components below.
const PROPERTY_FIELDS = [
  "builder_name", "estate_name", "lot_number", "street_address",
  "suburb", "state", "property_type", "bedrooms", "bathrooms", "car_spaces",
  "land_size_sqm", "house_size", "house_price", "land_price", "build_price",
  "expected_rent_weekly", "rebates", "titled",
  "sda_category", "status",
];

// AI extractor sometimes returns numbers with units ("181m²", "$650,000",
// "4 bed"). These columns are NUMERIC in Postgres so we strip everything
// but digits + decimal point before insert. Empty / unparseable → null.
const NUMERIC_FIELDS = new Set([
  "bedrooms", "bathrooms", "car_spaces",
  "land_size_sqm", "house_size",
  "house_price", "land_price", "build_price",
  "expected_rent_weekly",
]);

function coerceNumeric(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const { data: item, error: fetchErr } = await supabase
    .from("property_review_queue")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !item) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (item.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: `Item already ${item.status}` },
      { status: 409 },
    );
  }

  if (action === "reject") {
    const { error } = await supabase
      .from("property_review_queue")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: body.reviewed_by ?? "advisor",
        reasons: [...(item.reasons ?? []), `rejected: ${body.reason ?? "no reason given"}`],
      })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  if (action === "approve") {
    const merged = { ...item.raw_extraction, ...(body.edited_extraction ?? {}) };
    const row: Record<string, any> = {
      pipeline_status: "active",
      confidence_score: 1.0, // human-approved
      ingestion_run_id: item.ingestion_run_id,
      last_seen_at: new Date().toISOString(),
      source: "aggregator_v2_reviewed",
    };
    for (const f of PROPERTY_FIELDS) {
      if (f in merged) {
        row[f] = NUMERIC_FIELDS.has(f) ? coerceNumeric(merged[f]) : merged[f];
      }
    }

    // UPSERT not INSERT — global_stock_pool has a unique constraint on
    // (builder_name, lot_number, estate_name) and the aggregator may
    // already have written this row from the same ingestion run with a
    // lower confidence score. Approve = "use this version" so we want
    // to overwrite the existing record, not duplicate or 409.
    const { data: inserted, error: insertErr } = await supabase
      .from("global_stock_pool")
      .upsert(row, { onConflict: "builder_name,lot_number,estate_name" })
      .select("id")
      .single();
    if (insertErr) {
      return NextResponse.json(
        { ok: false, error: `Save failed: ${insertErr.message}` },
        { status: 500 },
      );
    }

    await supabase
      .from("property_review_queue")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: body.reviewed_by ?? "advisor",
        proposed_property_id: inserted.id,
      })
      .eq("id", id);

    return NextResponse.json({ ok: true, action: "approved", property_id: inserted.id });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
