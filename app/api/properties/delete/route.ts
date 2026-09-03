import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { publishPropertyWithdraw } from "../../../../utils/propchannel";

import { requireAuth } from "../../../../utils/cf-access";
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
// Cap on a single bulk withdraw. Comfortably covers "select-all + delete"
// from the UI while preventing a single bad request from withdrawing the
// whole catalogue. Anyone wanting a bigger purge can paginate.
const MAX_IDS = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { ids } = await req.json().catch(() => ({ ids: null }));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `Too many ids — max ${MAX_IDS} per request` },
      { status: 400 },
    );
  }
  if (!ids.every((id) => typeof id === "string" && UUID_RE.test(id))) {
    return NextResponse.json({ error: "Invalid id format" }, { status: 400 });
  }
  const { error } = await supabase
    .from("global_stock_pool")
    .update({
      pipeline_status: "withdrawn",
      withdrawn_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Fire-and-forget PropChannel withdraw notifications
  Promise.allSettled(ids.map((id: string) => publishPropertyWithdraw(id))).then((results) => {
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as any)?.ok === false));
    if (failed.length > 0) {
      console.warn("[propchannel] some withdraw notifications failed", failed.length);
    }
  });
  return NextResponse.json({ ok: true, withdrawn: ids.length });
}
