import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { errMessage } from "../../../../utils/errors";
import { brisbaneToday } from "../../../../utils/paid-services";
import { coercePartnerBody } from "../../../../utils/channel-partners";

export const dynamic = "force-dynamic";

/**
 * PATCH — edit a target, or `{ action: "pitched" }` after a pitch email went
 * out: stamps pitch_sent_at + last_contacted (Brisbane date) and moves a
 * not-yet-contacted row to "Contacted". A row already further along keeps its
 * status — re-sending to someone "In conversation" must not demote them.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    let row: Record<string, unknown>;
    if (b.action === "pitched") {
      const { data: cur, error: readErr } = await supabase
        .from("channel_partners")
        .select("status")
        .eq("id", id)
        .single();
      if (readErr) throw readErr;
      row = { pitch_sent_at: new Date().toISOString(), last_contacted: brisbaneToday() };
      if (cur?.status === "Not contacted" || cur?.status === "Researching") row.status = "Contacted";
    } else {
      row = coercePartnerBody(b, false);
      if ("company" in row && !row.company) {
        return NextResponse.json({ ok: false, error: "Company can't be blank" }, { status: 400 });
      }
    }
    row.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("channel_partners").update(row).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, partner: data });
  } catch (e) {
    log.error("channel_partners.update_failed", { id, ...errInfo(e) });
    return NextResponse.json({ ok: false, error: errMessage(e, "Save failed") }, { status: 500 });
  }
}
