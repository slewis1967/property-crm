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

export const dynamic = "force-dynamic";

const PROPERTY_FIELDS = [
  "builder_name", "estate_name", "lot_number", "street_address",
  "suburb", "state", "property_type", "bedrooms", "bathrooms", "car_spaces",
  "land_size_sqm", "house_size", "house_price", "land_price", "build_price",
  "total_package_price", "expected_rent_weekly", "rebates", "titled",
  "sda_category", "status",
];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      if (f in merged) row[f] = merged[f];
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("global_stock_pool")
      .insert(row)
      .select("id")
      .single();
    if (insertErr) {
      return NextResponse.json(
        { ok: false, error: `Insert failed: ${insertErr.message}` },
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
