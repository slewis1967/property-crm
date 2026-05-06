import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

/**
 * Soft-delete properties from the aggregator UI.
 *
 * Originally this route did a hard `DELETE FROM global_stock_pool` which
 * was destructive and unrecoverable: removing one row also broke any
 * downstream reference (PIA reports, opportunity matchmaker output,
 * historical analytics). Worse, an aggregator re-ingest of the same
 * email would just create a fresh row with a new id, severing any
 * previously-linked PIA reports / contact recommendations.
 *
 * Switched to the existing soft-delete model already used by the
 * aggregator's `withdraw_not_listed` pass: set pipeline_status='withdrawn'
 * and stamp withdrawn_at. Consumers (PIA picker, matchmaker, properties
 * grid) already filter these out so the visible behaviour is unchanged.
 */
export async function POST(req: NextRequest) {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }
  const { error } = await supabase
    .from("global_stock_pool")
    .update({
      pipeline_status: "withdrawn",
      withdrawn_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, withdrawn: ids.length });
}
