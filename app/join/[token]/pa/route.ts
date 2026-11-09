/**
 * PUBLIC guest view of the Preliminary Assessment being presented on a call.
 * TOKEN-AUTHENTICATED (the signed guest link), NO requireAuth.
 *
 * GET  /join/<token>/pa
 *   -> { ok, paId, stage: "pa" | "video" | "sent", videoUrl, sent }
 *   404 until the rep has pressed Present for this room.
 *
 * POST /join/<token>/pa  { action: "video-watched" }
 *   -> { ok, sent }
 *   An applicant confirming they have watched YLA's presentation. Records who
 *   confirmed, then sends the signing emails (once; the send is idempotent).
 *
 * INTERNET-FACING: rate-limited, generic 404s, no email addresses or error
 * detail in any response. Access rule and the reason this is not under /api:
 * see ./_shared.ts.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { log } from "../../../../utils/logger";
import {
  PRELIMINARY_ASSESSMENTS_TABLE,
  safeYlaVideoUrl,
} from "../../../../utils/preliminary-assessments";
import { guestConfirmedBy, guestPaStage } from "../../../../utils/pa-presentation";
import { sendPaForSigning } from "../../../../utils/pa-signing";
import { publicOrigin } from "../../../../utils/public-origin";
import { limitGuest, notFound, resolveGuestPa } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The POST renders and emails signing requests; give it room.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

/** A confirmation body is one short field. Anything bigger is not from our page. */
const MAX_BODY_BYTES = 1024;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const limited = limitGuest(req, token, 30);
  if (limited) return limited;

  try {
    const pa = await resolveGuestPa(token);
    if (!pa) return notFound();
    return NextResponse.json(
      {
        ok: true,
        paId: pa.id,
        stage: guestPaStage(pa),
        // Re-checked against the YLA host list on the way out, not just when it
        // was stored: this becomes a button an applicant taps.
        videoUrl: safeYlaVideoUrl(pa.video_url),
        sent: Boolean(pa.signing_sent_at),
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    log.error("pa.guest_state_failed", { message: e instanceof Error ? e.message : String(e) });
    return notFound();
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  // Tight: this is the one guest call that can cause email to be sent.
  const limited = limitGuest(req, token, 6);
  if (limited) return limited;

  let action: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return notFound();
    const body: unknown = JSON.parse(raw);
    action = body && typeof body === "object" ? (body as Record<string, unknown>).action : undefined;
  } catch {
    return notFound();
  }
  if (action !== "video-watched") return notFound();

  try {
    const pa = await resolveGuestPa(token);
    if (!pa) return notFound();

    // The video step has to have been put on screen by the rep. Without this a
    // guest link could trigger the signing emails before anything was presented.
    if (!pa.video_shown_at) return notFound();

    if (!pa.video_confirmed_at) {
      // `is null` in the filter, not just the read above: two applicants on two
      // phones press this within the same second, and the first one stays the
      // recorded confirmer.
      const { error } = await supabase
        .from(PRELIMINARY_ASSESSMENTS_TABLE)
        .update({
          video_confirmed_at: new Date().toISOString(),
          video_confirmed_by: guestConfirmedBy(pa.guestName),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pa.id)
        .is("video_confirmed_at", null);
      if (error) {
        log.error("pa.guest_confirm_failed", { paId: pa.id, message: error.message });
        return NextResponse.json({ ok: false, error: "Please try again." }, { status: 500, headers: NO_STORE });
      }
    }

    const result = await sendPaForSigning({
      paId: pa.id,
      origin: publicOrigin(req),
      createdBy: pa.presented_by ?? "video-call",
    });
    if (!result.ok) {
      // The confirmation is recorded and the rep's screen shows the failure with
      // a retry. The applicant is told only that it has not gone yet: the error
      // text can name addresses and is not theirs to read.
      log.error("pa.guest_send_failed", { paId: pa.id, status: result.status, message: result.error });
      return NextResponse.json({ ok: true, sent: false }, { headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, sent: true }, { headers: NO_STORE });
  } catch (e) {
    log.error("pa.guest_confirm_failed", { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, error: "Please try again." }, { status: 500, headers: NO_STORE });
  }
}
