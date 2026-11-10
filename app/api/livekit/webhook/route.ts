import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { webhookReceiver } from "../../../../utils/livekit";

/**
 * LiveKit server -> CRM webhook.
 *
 * The self-hosted LiveKit SFU is configured (deploy/livekit/livekit.yaml) to
 * POST lifecycle events here: room_started, participant_joined/left,
 * room_finished, and recording events. We verify the signature with the API
 * secret (WebhookReceiver) and append a row to `video_call_events` so a call
 * shows up on the contact's timeline alongside appointments/SMS/email.
 *
 * This is append-only telemetry: we never block the SFU. Any failure still
 * returns 200 so LiveKit doesn't spin on retries — we just log server-side.
 *
 * Auth model: the request is NOT behind Cloudflare Access (it's server->server
 * from LiveKit), so requireAuth does not apply. Trust comes from the signed
 * JWT in the Authorization header, verified below.
 */
export async function POST(req: NextRequest) {
  const receiver = webhookReceiver();
  if (!receiver) {
    // LiveKit not configured here — 200 so it doesn't retry forever.
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const rawBody = await req.text();

  let event;
  try {
    // Verifies the JWT signature against the API secret before we trust it.
    event = await receiver.receive(rawBody, authHeader);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid webhook signature" },
      { status: 401 },
    );
  }

  // Room names are `contact-<uuid>`; pull the contact id back out so the event
  // links to the contact. Non-contact rooms just log with a null contact_id.
  const roomName = event.room?.name ?? "";
  const contactId = roomName.startsWith("contact-")
    ? roomName.slice("contact-".length)
    : null;

  try {
    await supabase.from("video_call_events").insert({
      event: event.event, // room_started | participant_joined | room_finished | ...
      room: roomName || null,
      contact_id: contactId,
      participant_identity: event.participant?.identity ?? null,
      participant_name: event.participant?.name ?? null,
      num_participants: event.room?.numParticipants ?? null,
      egress_id: event.egressInfo?.egressId ?? null,
      recording_url:
        event.egressInfo?.fileResults?.[0]?.location ?? null,
      raw: event as unknown as Record<string, unknown>,
    });
  } catch (err) {
    // Swallow: telemetry must never break the SFU. Surface in server logs.
    console.error("[livekit webhook] failed to log event", err);
  }

  return NextResponse.json({ ok: true });
}
