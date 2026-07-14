import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth, userEmailFromRequest, isUnauthenticated } from "../../../../utils/cf-access";
import {
  REVENUE_COST_COLUMNS,
  revenueErrMessage,
  revenueTableMissing,
} from "../../../../utils/revenue";

export const dynamic = "force-dynamic";

const COSTS_HINT = "Operating-costs storage isn't set up yet — run migrations/20260714_revenue_costs.sql in the Supabase SQL editor.";
const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

/** GET — list operating-cost line items. */
export async function GET(req: Request) {
  const email = await userEmailFromRequest(req);
  if (isUnauthenticated(email)) return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  try {
    const { data, error } = await supabase.from("revenue_costs").select(REVENUE_COST_COLUMNS).order("created_at", { ascending: true });
    if (error) {
      if (revenueTableMissing(error)) return NextResponse.json({ ok: true, costs: [], tableMissing: true, hint: COSTS_HINT });
      throw error;
    }
    return NextResponse.json({ ok: true, costs: data ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: revenueErrMessage(e, "Could not load operating costs") }, { status: 500 });
  }
}

/** POST — add an operating-cost line item. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ ok: false, error: "A label is required." }, { status: 400 });
  try {
    const { data, error } = await supabase
      .from("revenue_costs")
      .insert({ label, monthly_amount: num(body.monthly_amount) })
      .select(REVENUE_COST_COLUMNS)
      .single();
    if (error) {
      if (revenueTableMissing(error)) return NextResponse.json({ ok: false, tableMissing: true, error: COSTS_HINT }, { status: 503 });
      throw error;
    }
    return NextResponse.json({ ok: true, cost: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: revenueErrMessage(e, "Could not add the cost") }, { status: 500 });
  }
}
