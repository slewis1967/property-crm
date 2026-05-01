/**
 * Review queue list endpoint.
 *
 * GET /api/aggregator/review-queue?status=pending&limit=50
 *
 * Returns property_review_queue rows joined with their ingestion_run for context.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

  const { data, error } = await supabase
    .from("property_review_queue")
    .select(`
      id, raw_extraction, proposed_action, proposed_property_id,
      builder_name, estate_name, lot_number, confidence_score, reasons,
      status, reviewed_by, reviewed_at, created_at, ingestion_run_id,
      ingestion_run:ingestion_run_id ( email_subject, started_at, builder_name )
    `)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}
