/**
 * Drive a Preliminary Assessment presentation from the call screen (staff).
 *
 * POST /api/preliminary-assessments/<id>/present
 *   { action: "start" | "finish" | "video-confirmed", room }
 *
 *   start            -> { ok, assessment }
 *     Stamps `presentation_room`. That column is what lets the applicants in
 *     this room fetch the PDF through their guest link (app/join/[token]/pa),
 *     so nothing is exposed until a rep presses Present.
 *   finish           -> { ok, assessment }
 *     The rep has been through the document: presented_at / presented_by,
 *     status Received -> Presented, and video_shown_at (the applicants' screens
 *     move to "watch YLA's presentation").
 *   video-confirmed  -> { ok, sentTo, alreadySent, assessment }
 *                     | { ok: false, error, assessment } (send failed)
 *     The rep vouches the video was watched; records it and sends the PA for
 *     e-signature. sendPaForSigning is idempotent, so pressing this after an
 *     applicant already confirmed sends nothing twice.
 *
 * Every action re-checks that the PA is live and that `room` is this PA's
 * contact's own room. The room comes from the browser, so without that check a
 * rep on one client's call could put another client's credit proposal in front
 * of them by posting a different id.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../../utils/cf-access";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { supabase } from "../../../../../utils/supabase";
import { log } from "../../../../../utils/logger";
import { roomForContact } from "../../../../../utils/livekit-rooms";
import {
  PA_LIST_COLUMNS,
  PRELIMINARY_ASSESSMENTS_TABLE,
  isLivePa,
  toPaListRow,
  type PaListRow,
} from "../../../../../utils/preliminary-assessments";
import { isUuid } from "../../../../../utils/pa-presentation";
import { sendPaForSigning } from "../../../../../utils/pa-signing";
import { publicOrigin } from "../../../../../utils/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// video-confirmed renders and emails the signing requests.
export const maxDuration = 60;

const ACTIONS = ["start", "finish", "video-confirmed"] as const;
type Action = (typeof ACTIONS)[number];

/** List columns plus the two the checks below need and the list view omits. */
const COLUMNS = `${PA_LIST_COLUMNS},presentation_room,presented_by`;

function fail(error: string, status: number, assessment?: PaListRow): NextResponse {
  return NextResponse.json({ ok: false, error, ...(assessment ? { assessment } : {}) }, { status });
}

async function loadRow(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from(PRELIMINARY_ASSESSMENTS_TABLE)
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown> | null) ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const rep = auth;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 30 });
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return fail("Preliminary Assessment not found.", 404);

  let body: { action?: unknown; room?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = ACTIONS.find((a) => a === body?.action) as Action | undefined;
  const room = typeof body?.room === "string" ? body.room.trim() : "";
  if (!action) return fail("Unknown action.", 400);
  if (!room) return fail("room is required.", 400);

  try {
    const row = await loadRow(id);
    if (!row) return fail("Preliminary Assessment not found.", 404);

    if (!isLivePa(String(row.status))) {
      return fail("This Preliminary Assessment is signed or has been replaced, so it can no longer be presented.", 409);
    }
    const contactId = typeof row.contact_id === "string" ? row.contact_id : "";
    if (!contactId) {
      return fail("This Preliminary Assessment is not matched to a client yet.", 409);
    }
    if (room !== roomForContact(contactId)) {
      return fail("This Preliminary Assessment belongs to a different client's call.", 403);
    }

    const now = new Date().toISOString();

    if (action === "start") {
      const { error } = await supabase
        .from(PRELIMINARY_ASSESSMENTS_TABLE)
        .update({ presentation_room: room, presentation_started_at: now, updated_at: now })
        .eq("id", id);
      if (error) throw new Error(error.message);
      log.info("pa.present_started", { paId: id, rep });
    }

    if (action === "finish") {
      // First-finish stamps are kept. Presenting the same PA again (a second
      // applicant who missed the first call) must not move the record of when
      // it was first presented, or of who presented it.
      const patch: Record<string, unknown> = {
        presentation_room: room,
        presentation_started_at: now,
        updated_at: now,
      };
      if (!row.presented_at) {
        patch.presented_at = now;
        patch.presented_by = rep;
      }
      if (!row.video_shown_at) patch.video_shown_at = now;
      if (row.status === "Received") patch.status = "Presented";
      const { error } = await supabase.from(PRELIMINARY_ASSESSMENTS_TABLE).update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      log.info("pa.present_finished", { paId: id, rep });
    }

    if (action === "video-confirmed") {
      // Same order the applicants are held to: the video step has to have been
      // shown before anyone can say it was watched.
      if (!row.video_shown_at) {
        return fail("Finish presenting the Preliminary Assessment before sending it for signing.", 409, toPaListRow(row));
      }
      if (!row.video_confirmed_at) {
        // `is null` in the filter so an applicant who confirmed a moment ago
        // stays the recorded confirmer.
        const { error } = await supabase
          .from(PRELIMINARY_ASSESSMENTS_TABLE)
          .update({ video_confirmed_at: now, video_confirmed_by: rep, updated_at: now })
          .eq("id", id)
          .is("video_confirmed_at", null);
        if (error) throw new Error(error.message);
      }

      const result = await sendPaForSigning({ paId: id, origin: publicOrigin(req), createdBy: rep });
      const fresh = await loadRow(id);
      const assessment = toPaListRow(fresh ?? row);
      if (!result.ok) {
        log.error("pa.present_send_failed", { paId: id, rep, status: result.status, message: result.error });
        return fail(result.error, result.status, assessment);
      }
      log.info("pa.present_sent_for_signing", { paId: id, rep, recipients: result.sentTo.length });
      return NextResponse.json({ ...result, assessment });
    }

    const fresh = await loadRow(id);
    return NextResponse.json({ ok: true, assessment: toPaListRow(fresh ?? row) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("pa.present_failed", { paId: id, action, rep, message });
    return fail("Could not update the Preliminary Assessment. Please try again.", 500);
  }
}
