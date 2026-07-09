import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { log, errInfo } from "../../../utils/logger";
import { dealErrMessage, dealsTableMissing, DEAL_STAGES } from "../../../utils/deals";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Development Watchlist storage isn't set up yet — run migrations/20260702_dev_opportunities.sql in the Supabase SQL editor.";

/** GET — list watchlist opportunities (newest first). */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { data, error } = await supabase
      .from("dev_opportunities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      if (dealsTableMissing(error)) return NextResponse.json({ ok: true, deals: [] });
      throw error;
    }
    return NextResponse.json({ ok: true, deals: data ?? [] });
  } catch (e) {
    log.error("deals.list_failed", { detail: dealErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: dealErrMessage(e, "List failed") }, { status: 500 });
  }
}

/** POST — add an opportunity to the watchlist. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);

    const stage = typeof b.stage === "string" && (DEAL_STAGES as readonly string[]).includes(b.stage)
      ? b.stage
      : "Identified";

    const row = {
      source: b.source === "feasibility" ? "feasibility" : "prospecting",
      address: str(b.address),
      lot_plan: str(b.lotPlan),
      lga: str(b.lga),
      state: str(b.state),
      zone_code: str(b.zoneCode),
      area_sqm: num(b.areaSqm),
      min_lot_sqm: num(b.minLotSqm),
      est_lots: num(b.estLots),
      extra_lots: num(b.extraLots),
      center: b.center && typeof b.center === "object" ? b.center : null,
      stage,
      notes: str(b.notes),
      feasibility_report_id: str(b.feasibilityReportId),
      data: b.data && typeof b.data === "object" ? b.data : null,
      created_by: auth,
    };

    const { data, error } = await supabase.from("dev_opportunities").insert(row).select("id").single();
    if (error) {
      if (dealsTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    log.error("deals.create_failed", { detail: dealErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: dealErrMessage(e, "Save failed") }, { status: 500 });
  }
}
