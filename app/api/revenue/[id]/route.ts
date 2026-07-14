import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import {
  REVENUE_COLUMNS,
  REVENUE_MIGRATION_HINT,
  isDealStage,
  normalisePayments,
  revenueErrMessage,
  revenueTableMissing,
} from "../../../../utils/revenue";

export const dynamic = "force-dynamic";

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

/** PATCH — update any deal field (edit, or toggle a payment's paid flag). */
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
  if (typeof body.lot === "string" && body.lot.trim()) patch.lot = body.lot.trim();
  if ("purchaser" in body) patch.purchaser = typeof body.purchaser === "string" && body.purchaser.trim() ? body.purchaser.trim() : null;
  if ("remuneration" in body) patch.remuneration = num(body.remuneration);
  if ("referrer_fee" in body) patch.referrer_fee = num(body.referrer_fee);
  if ("referrer_note" in body) patch.referrer_note = typeof body.referrer_note === "string" && body.referrer_note.trim() ? body.referrer_note.trim() : null;
  if ("payments" in body) patch.payments = normalisePayments(body.payments);
  if (isDealStage(body.stage)) patch.stage = body.stage;
  if ("notes" in body) patch.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  try {
    const { data, error } = await supabase.from("revenue_deals").update(patch).eq("id", id).select(REVENUE_COLUMNS).single();
    if (error) {
      if (revenueTableMissing(error)) {
        return NextResponse.json({ ok: false, tableMissing: true, error: REVENUE_MIGRATION_HINT }, { status: 503 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, deal: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: revenueErrMessage(e, "Could not update the deal") }, { status: 500 });
  }
}

/** DELETE — remove a deal. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { error } = await supabase.from("revenue_deals").delete().eq("id", id);
    if (error) {
      if (revenueTableMissing(error)) {
        return NextResponse.json({ ok: false, tableMissing: true, error: REVENUE_MIGRATION_HINT }, { status: 503 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: revenueErrMessage(e, "Could not delete the deal") }, { status: 500 });
  }
}
