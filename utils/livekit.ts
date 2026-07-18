/**
 * Self-hosted LiveKit helpers (server-side only).
 *
 * The CRM embeds video calls (broker <-> client) directly in a contact /
 * opportunity page. We run our OWN LiveKit SFU (see deploy/livekit/) rather
 * than a SaaS, so the only things this module needs are:
 *   - LIVEKIT_API_KEY / LIVEKIT_API_SECRET  -> mint join tokens + verify webhooks
 *   - NEXT_PUBLIC_LIVEKIT_URL               -> the wss:// URL the browser connects to
 *
 * Token minting and webhook verification both use the API secret, so this
 * module must never be imported from a "use client" component (the secret is
 * not in the browser bundle). The browser only ever receives a short-lived,
 * room-scoped JWT from /api/livekit/token.
 *
 * Config is read lazily inside each function, never thrown at import time,
 * because this can be imported on paths where LiveKit isn't configured yet.
 */
import {
  AccessToken,
  WebhookReceiver,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
} from "livekit-server-sdk";

/** Public wss:// URL the browser dials. Safe to expose (no secret). */
export function livekitBrowserUrl(): string {
  return process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
}

function serverCreds(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

export function livekitConfigured(): boolean {
  return serverCreds() !== null && livekitBrowserUrl() !== "";
}

/**
 * Deterministic room name for a contact so every participant who opens the
 * same contact lands in the same room. Kept URL/route safe.
 */
export function roomForContact(contactId: string): string {
  return `contact-${contactId}`;
}

export interface MintTokenOpts {
  /** Stable identity for the participant (we use their CRM email). */
  identity: string;
  /** Display name shown in the call UI. */
  name?: string;
  /** Room to join. */
  room: string;
  /** Whether this participant may publish audio/video (default true). */
  canPublish?: boolean;
}

/**
 * Mint a short-lived, room-scoped join token. Throws if LiveKit isn't
 * configured — callers (the token route) surface that as a 503 so the UI can
 * show "video not configured" instead of a broken call.
 */
export async function mintJoinToken(opts: MintTokenOpts): Promise<string> {
  const creds = serverCreds();
  if (!creds) {
    throw new Error("LiveKit not configured (LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing)");
  }
  const at = new AccessToken(creds.apiKey, creds.apiSecret, {
    identity: opts.identity,
    name: opts.name ?? opts.identity,
    // Tokens are cheap to re-mint on page load; keep the window tight.
    ttl: "2h",
  });
  at.addGrant({
    roomJoin: true,
    room: opts.room,
    canPublish: opts.canPublish ?? true,
    canSubscribe: true,
    canPublishData: true,
  });
  return at.toJwt();
}

/**
 * Build a WebhookReceiver for /api/livekit/webhook. Returns null when LiveKit
 * isn't configured (the webhook route then 200s and no-ops, so LiveKit doesn't
 * keep retrying against an unconfigured origin).
 */
export function webhookReceiver(): WebhookReceiver | null {
  const creds = serverCreds();
  if (!creds) return null;
  return new WebhookReceiver(creds.apiKey, creds.apiSecret);
}

/**
 * The EgressClient (recording) talks to LiveKit's HTTP API, not the wss://
 * signalling URL — derive the https:// base from NEXT_PUBLIC_LIVEKIT_URL.
 */
function livekitHttpUrl(): string {
  const wss = livekitBrowserUrl();
  if (!wss) return "";
  return wss.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

function egressClient(): EgressClient | null {
  const creds = serverCreds();
  const host = livekitHttpUrl();
  if (!creds || !host) return null;
  return new EgressClient(host, creds.apiKey, creds.apiSecret);
}

/**
 * Start recording a room (server-side composite → single MP4).
 *
 * Requires the LiveKit **egress** service to be deployed (deploy/livekit-egress/)
 * — the egress service holds the S3/Supabase-storage credentials and uploads the
 * finished file, so the CRM only supplies a filepath. The resulting file's
 * location arrives later via the egress_ended webhook and is stored on the
 * matching `video_call_events` row (`recording_url`).
 *
 * Returns the egressId (persist it so the call can be stopped) or throws with a
 * clear message the record route surfaces as a 503.
 */
export async function startRoomRecording(room: string): Promise<string> {
  const client = egressClient();
  if (!client) {
    throw new Error("Recording is not configured (LiveKit egress unavailable).");
  }
  // Timestamped path keeps repeat calls in the same room from colliding.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: `recordings/${room}/${stamp}.mp4`,
  });
  const info = await client.startRoomCompositeEgress(room, output, {
    layout: "grid",
  });
  return info.egressId;
}

/** Stop an in-progress recording by its egressId. */
export async function stopRoomRecording(egressId: string): Promise<void> {
  const client = egressClient();
  if (!client) {
    throw new Error("Recording is not configured (LiveKit egress unavailable).");
  }
  await client.stopEgress(egressId);
}

/** Whether recording *could* work (egress client constructable). */
export function recordingConfigured(): boolean {
  return egressClient() !== null;
}
