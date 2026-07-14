import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import {
  REVENUE_COST_COLUMNS,
  revenueErrMessage,
  revenueTableMissing,
} from "../../../../../utils/revenue";

export const dynamic = "force-dynamic";

const COSTS_HINT = "Operating-costs storage isn't set up yet — run migrations/20260714_revenue_costs.sql in the Supabase SQL editor.";
const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

/** PATCH — edit a cost line item. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim();
  if ("monthly_amount" in body) patch.monthly_amount = num(body.monthly_amount);
  if (Object.keys(patch).length === 1) return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  try {
    const { data, error } = await supabase.from("revenue_costs").update(patch).eq("id", id).select(REVENUE_COST_COLUMNS).single();
    if (error) {
      if (revenueTableMissing(error)) return NextResponse.json({ ok: false, tableMissing: true, error: COSTS_HINT }, { status: 503 });
      throw error;
    }
    return NextResponse.json({ ok: true, cost: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: revenueErrMessage(e, "Could not update the cost") }, { status: 500 });
  }
}

/** DELETE — remove a cost line item. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { error } = await supabase.from("revenue_costs").delete().eq("id", id);
    if (error) {
      if (revenueTableMissing(error)) return NextResponse.json({ ok: false, tableMissing: true, error: COSTS_HINT }, { status: 503 });
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: revenueErrMessage(e, "Could not delete the cost") }, { status: 500 });
  }
}
