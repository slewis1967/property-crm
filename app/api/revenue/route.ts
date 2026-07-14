import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth, userEmailFromRequest, isUnauthenticated } from "../../../utils/cf-access";
import {
  REVENUE_COLUMNS,
  REVENUE_COLUMNS_BASE,
  REVENUE_MIGRATION_HINT,
  isDealStage,
  normalisePayments,
  revenueColumnsMissing,
  revenueErrMessage,
  revenueTableMissing,
} from "../../../utils/revenue";

export const dynamic = "force-dynamic";

/** GET — list all deals, newest first. Empty list when unmigrated. */
export async function GET(req: Request) {
  const email = await userEmailFromRequest(req);
  if (isUnauthenticated(email)) {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }
  try {
    const primary = await supabase
      .from("revenue_deals")
      .select(REVENUE_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500);
    let rows: unknown[] | null = primary.data as unknown[] | null;
    let error = primary.error;
    if (error && revenueColumnsMissing(error)) {
      const fb = await supabase
        .from("revenue_deals")
        .select(REVENUE_COLUMNS_BASE)
        .order("created_at", { ascending: false })
        .limit(500);
      rows = fb.data as unknown[] | null;
      error = fb.error;
    }
    if (error) {
      if (revenueTableMissing(error)) {
        return NextResponse.json({ ok: true, deals: [], tableMissing: true, hint: REVENUE_MIGRATION_HINT });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, deals: rows ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: revenueErrMessage(e, "Could not load deals") }, { status: 500 });
  }
}

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

/** POST — create a deal. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const lot = typeof body.lot === "string" ? body.lot.trim() : "";
  if (!lot) return NextResponse.json({ ok: false, error: "A lot / address is required." }, { status: 400 });

  const supplier = typeof body.supplier === "string" && body.supplier.trim() ? body.supplier.trim() : null;
  const base = {
    lot,
    purchaser: typeof body.purchaser === "string" && body.purchaser.trim() ? body.purchaser.trim() : null,
    remuneration: num(body.remuneration),
    referrer_fee: num(body.referrer_fee),
    referrer_note: typeof body.referrer_note === "string" && body.referrer_note.trim() ? body.referrer_note.trim() : null,
    payments: normalisePayments(body.payments),
    stage: isDealStage(body.stage) ? body.stage : "active",
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
  };

  try {
    const primary = await supabase.from("revenue_deals").insert({ ...base, supplier }).select(REVENUE_COLUMNS).single();
    let data: unknown = primary.data;
    let error = primary.error;
    if (error && revenueColumnsMissing(error)) {
      // supplier column not migrated yet — insert without it
      const fb = await supabase.from("revenue_deals").insert(base).select(REVENUE_COLUMNS_BASE).single();
      data = fb.data;
      error = fb.error;
    }
    if (error) {
      if (revenueTableMissing(error)) {
        return NextResponse.json({ ok: false, tableMissing: true, error: REVENUE_MIGRATION_HINT }, { status: 503 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, deal: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: revenueErrMessage(e, "Could not create the deal") }, { status: 500 });
  }
}
