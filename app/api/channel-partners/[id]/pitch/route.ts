import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { errMessage } from "../../../../../utils/errors";
import { unsubscribedEmails } from "../../../../../utils/brevo";
import { reviewBroadcastCopy } from "../../../../../utils/compliance-review";
import { getStockStats, springboardPitchRef } from "../../../../../utils/channel-partners-server";
import {
  buildCallScript,
  buildPitchEmail,
  pitchTextToHtml,
  type ChannelPartner,
} from "../../../../../utils/channel-partners";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

/**
 * POST /api/channel-partners/[id]/pitch
 *
 *   { action: "build" }  — the tailored email + phone script for this partner,
 *                          plus whether their address is on the unsubscribe list.
 *                          Cheap: no AI.
 *   { action: "review", subject, text }
 *                        — run the operator's (possibly edited) email through the
 *                          same AU-compliance reviewer as Broadcast, and return
 *                          the HTML that would be sent.
 *
 * Sending is NOT here: the panel sends through /api/emails (so it lands in
 * email_log with the sender's own signature, like every other CRM email) and
 * then PATCHes the partner with { action: "pitched" }.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const b = (await req.json()) as { action?: string; subject?: unknown; text?: unknown };
    const { data: row, error } = await supabase.from("channel_partners").select("*").eq("id", id).single();
    if (error) throw error;
    const partner = row as ChannelPartner;

    if (b.action === "build") {
      const stats = await getStockStats();
      const opts = { springboardRef: springboardPitchRef() };
      const email = buildPitchEmail(partner, stats, opts);
      const unsubscribed = partner.email ? (await unsubscribedEmails([partner.email])).size > 0 : false;
      return NextResponse.json({
        ok: true,
        email,
        callScript: buildCallScript(partner, stats, opts),
        unsubscribed,
      });
    }

    if (b.action === "review") {
      const subject = typeof b.subject === "string" ? b.subject.trim() : "";
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (!subject || !text) {
        return NextResponse.json({ ok: false, error: "subject and text are required" }, { status: 400 });
      }
      const html = pitchTextToHtml(text);
      try {
        const review = await reviewBroadcastCopy({ subject, html_body: html, text_body: text, brand: "nextkey" });
        return NextResponse.json({ ok: true, html, violations: review.violations, reviewed: true });
      } catch (e) {
        // Same stance as Broadcast: a reviewer outage is surfaced, not hidden,
        // and the operator decides whether to send unreviewed.
        log.warn("channel_partners.review_unavailable", { id, ...errInfo(e) });
        return NextResponse.json({ ok: true, html, violations: [], reviewed: false, reviewError: errMessage(e, "Reviewer unavailable") });
      }
    }

    return NextResponse.json({ ok: false, error: "action must be build | review" }, { status: 400 });
  } catch (e) {
    log.error("channel_partners.pitch_failed", { id, ...errInfo(e) });
    return NextResponse.json({ ok: false, error: errMessage(e, "Pitch failed") }, { status: 500 });
  }
}
