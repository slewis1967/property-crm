import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import {
  startRoomRecording,
  stopRoomRecording,
  recordingConfigured,
} from "../../../../utils/livekit";

/**
 * Start / stop recording a LiveKit room.
 *
 * POST { room, action: "start" }          -> { ok, egressId }
 * POST { action: "stop", egressId }       -> { ok }
 *
 * Auth: the authenticated CRM user (Cloudflare Access). Recording needs the
 * LiveKit egress service deployed; when it isn't, returns 503 so the call UI
 * can show "recording unavailable" instead of a hard error.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (!recordingConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Recording is not configured on this server." },
      { status: 503 },
    );
  }

  let body: { room?: string; action?: string; egressId?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    if (body.action === "stop") {
      if (!body.egressId) {
        return NextResponse.json(
          { ok: false, error: "egressId is required to stop recording." },
          { status: 400 },
        );
      }
      await stopRoomRecording(body.egressId);
      return NextResponse.json({ ok: true });
    }

    // default action: start
    const room = body.room?.trim();
    if (!room) {
      return NextResponse.json(
        { ok: false, error: "room is required to start recording." },
        { status: 400 },
      );
    }
    const egressId = await startRoomRecording(room);
    return NextResponse.json({ ok: true, egressId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Recording request failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}
