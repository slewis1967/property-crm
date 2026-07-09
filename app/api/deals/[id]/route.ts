import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { dealErrMessage, DEAL_STAGES } from "../../../../utils/deals";

export const dynamic = "force-dynamic";

/** PATCH — update stage and/or notes on a watchlist opportunity. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const b = (await req.json()) as { stage?: string; notes?: string };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof b.stage === "string" && (DEAL_STAGES as readonly string[]).includes(b.stage)) patch.stage = b.stage;
    if (typeof b.notes === "string") patch.notes = b.notes;

    const { error } = await supabase.from("dev_opportunities").update(patch).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("deals.update_failed", { detail: dealErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: dealErrMessage(e, "Update failed") }, { status: 500 });
  }
}

/** DELETE — remove a watchlist opportunity. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { error } = await supabase.from("dev_opportunities").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("deals.delete_failed", { detail: dealErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: dealErrMessage(e, "Delete failed") }, { status: 500 });
  }
}
