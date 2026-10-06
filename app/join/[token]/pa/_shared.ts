/**
 * Shared resolution for the guest Preliminary Assessment routes
 * (app/join/[token]/pa/*). Not a route (underscore-prefixed).
 *
 * WHY THESE LIVE UNDER /join AND NOT /api: an applicant has no Cloudflare
 * Access identity. `/join/*` already has a CF Access bypass app and a matching
 * carve-out in proxy.ts (isPublicGuestRoute); `/api/*` has neither for this
 * feature, and the guest carve-out there is deliberately one exact path. Adding
 * an /api endpoint would have needed a dashboard change that cannot ship with
 * the code. So the handlers sit beside the page that calls them.
 *
 * WHAT THAT COSTS: proxy.ts only applies its Origin (CSRF) check to mutating
 * requests under /api/. It does not cover a POST here. That is acceptable
 * because nothing on these routes is authenticated by a cookie: the signed
 * token in the path is the whole credential, and a page on another site that
 * does not already hold the token has nothing a browser would attach for it.
 *
 * THE ONE ACCESS RULE, in one place: token -> room -> contact -> the newest
 * live PA whose `presentation_room` is that room AND whose presentation started
 * within GUEST_PA_WINDOW_MS. Both are only written when a rep presses Present,
 * so a guest link on its own never exposes a PA the rep has not chosen to show,
 * and stops exposing it a few hours after the call. Every failure looks the same from
 * outside (null here, a generic 404 from the caller).
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { verifyGuestToken } from "../../../../utils/guest-token";
import { enforceRateLimit } from "../../../../utils/rate-limit";
import {
  PA_STATUSES,
  PRELIMINARY_ASSESSMENTS_TABLE,
  isLivePa,
} from "../../../../utils/preliminary-assessments";
import {
  contactIdFromRoom,
  guestRateKey,
  guestWindowOpen,
} from "../../../../utils/pa-presentation";

/** A guest token is a compact JWT. Anything far outside that shape is not one. */
const MAX_TOKEN_LENGTH = 2048;

/** PostgREST needs the list spelt out; derived so it cannot drift from isLivePa(). */
const LIVE_STATUSES = PA_STATUSES.filter((s) => isLivePa(s));

export type GuestPa = {
  id: string;
  pdf_path: string;
  video_url: string | null;
  presented_by: string | null;
  video_shown_at: string | null;
  video_confirmed_at: string | null;
  signing_sent_at: string | null;
  /** Display name from the signed token, for `video_confirmed_by`. */
  guestName: string | undefined;
};

export function notFound(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Not available" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/** How many callers' worth of traffic one link may carry before it is cut off. */
const LINK_CEILING_FACTOR = 5;

/**
 * Two limits. Returns a 429 to send back, or null to carry on.
 *
 * PER LINK (`max` x LINK_CEILING_FACTOR) IS THE GUARANTEE. It is keyed on the
 * link and nothing else, so no header the caller sends can raise it.
 *
 * PER CALLER ON A LINK (`max`) IS A COURTESY, NOT A CONTROL. The applicants on
 * one call share a link, so with the link limit alone one of them reloading
 * hard could lock the others out mid-presentation. Splitting the budget by
 * CF-Connecting-IP stops that happening by accident. It is NOT tamper-proof:
 * these paths are exempt from the tunnel gate (a guest has no Cloudflare Access
 * identity), so a caller who goes to the Netlify origin directly can write that
 * header and take a fresh per-caller bucket. All that buys them is the link
 * ceiling, and only for a link they already hold. Do not lean on the per-caller
 * figure for anything that matters.
 *
 * Both are keyed on the bare path: enforceRateLimit folds the full URL into
 * its key, so a different query string per request would otherwise open a new
 * bucket every time.
 */
export function limitGuest(req: Request, token: string, max: number): NextResponse | null {
  const url = new URL(req.url);
  const bare = new Request(`${url.origin}${url.pathname}`, { method: req.method });
  const caller = (req.headers.get("cf-connecting-ip") || "").trim() || "unknown";
  return (
    enforceRateLimit(bare, {
      windowMs: 60_000,
      max,
      keyFn: () => guestRateKey(`ip:${caller}`, token),
    }) ??
    enforceRateLimit(bare, {
      windowMs: 60_000,
      max: max * LINK_CEILING_FACTOR,
      keyFn: () => guestRateKey("link", token),
    })
  );
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * The PA this guest link may see right now, or null. A bad token, a room with
 * no PA and a database error all read as "nothing to show", which is the safe
 * answer for a public endpoint.
 */
export async function resolveGuestPa(token: string): Promise<GuestPa | null> {
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH) return null;

  let claims: { room: string; name?: string };
  try {
    claims = await verifyGuestToken(token);
  } catch {
    return null;
  }

  // Guest links also exist for rooms that are not a contact's (ad-hoc meetings).
  // Those never carry a PA.
  const contactId = contactIdFromRoom(claims.room);
  if (!contactId) return null;

  const { data, error } = await supabase
    .from(PRELIMINARY_ASSESSMENTS_TABLE)
    .select(
      "id,pdf_path,video_url,presented_by,video_shown_at,video_confirmed_at,signing_sent_at,presentation_started_at",
    )
    .eq("contact_id", contactId)
    .eq("presentation_room", claims.room)
    .in("status", LIVE_STATUSES)
    .order("received_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;

  const row = data[0] as Record<string, unknown>;
  // The link outlives the call (it is in the calendar invite), so access is
  // tied to a recent Present, not just to one having happened once.
  if (!guestWindowOpen(str(row.presentation_started_at), Date.now())) return null;
  const id = str(row.id);
  const pdfPath = str(row.pdf_path);
  if (!id || !pdfPath) return null;

  return {
    id,
    pdf_path: pdfPath,
    video_url: str(row.video_url),
    presented_by: str(row.presented_by),
    video_shown_at: str(row.video_shown_at),
    video_confirmed_at: str(row.video_confirmed_at),
    signing_sent_at: str(row.signing_sent_at),
    guestName: claims.name,
  };
}
