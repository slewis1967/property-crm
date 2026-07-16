import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";

/**
 * GET /api/livekit/calls?contactId=<uuid>
 *
 * Returns the video-call history for a contact, aggregated from the raw
 * `video_call_events` rows the LiveKit webhook logs. Events are grouped into
 * call *sessions* by the LiveKit room sid (unique per call — the room *name*
 * `contact-<id>` is reused for every call with that contact, so grouping by
 * name alone would merge separate calls).
 *
 * Degrades gracefully: if the table hasn't been migrated yet, returns an empty
 * list rather than erroring, so the contact panel just shows "no calls".
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const contactId = req.nextUrl.searchParams.get("contactId");
  if (!contactId) {
    return NextResponse.json(
      { ok: false, error: "contactId is required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("video_call_events")
    .select(
      "event, room, participant_identity, participant_name, num_participants, recording_url, raw, created_at",
    )
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error || !data) {
    // Table missing (pre-migration) or transient read error — non-critical
    // panel, so degrade to empty instead of surfacing a 500.
    return NextResponse.json({ ok: true, sessions: [] });
  }

  type Session = {
    sid: string;
    room: string | null;
    startedAt: string;
    endedAt: string | null;
    participants: Set<string>;
    maxParticipants: number;
    recordingUrl: string | null;
  };
  const byId = new Map<string, Session>();

  for (const ev of data) {
    const raw = (ev.raw ?? {}) as { room?: { sid?: string } };
    const sid = raw.room?.sid || ev.room || "unknown";
    let s = byId.get(sid);
    if (!s) {
      s = {
        sid,
        room: ev.room,
        startedAt: ev.created_at,
        endedAt: null,
        participants: new Set<string>(),
        maxParticipants: 0,
        recordingUrl: null,
      };
      byId.set(sid, s);
    }
    if (ev.created_at < s.startedAt) s.startedAt = ev.created_at;
    if (ev.event === "room_finished") s.endedAt = ev.created_at;
    const who = ev.participant_name || ev.participant_identity;
    if (who && ev.event === "participant_joined") s.participants.add(who);
    if (typeof ev.num_participants === "number") {
      s.maxParticipants = Math.max(s.maxParticipants, ev.num_participants);
    }
    if (ev.recording_url) s.recordingUrl = ev.recording_url;
  }

  const sessions = [...byId.values()]
    .map((s) => ({
      sid: s.sid,
      room: s.room,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationSec: s.endedAt
        ? Math.max(
            0,
            Math.round(
              (new Date(s.endedAt).getTime() -
                new Date(s.startedAt).getTime()) /
                1000,
            ),
          )
        : null,
      participants: [...s.participants],
      participantCount: Math.max(s.participants.size, s.maxParticipants),
      recordingUrl: s.recordingUrl,
    }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return NextResponse.json({ ok: true, sessions });
}
