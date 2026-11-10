/**
 * GET /api/portal/mygov-poster — PUBLIC (CF-Access-bypassed /api/portal/*).
 *
 * The still shown before the walkthrough is played: the video's own Springboard
 * title card. Without it the player opens on a black rectangle, because
 * preload="metadata" doesn't paint a first frame in Chrome until playback
 * starts — which reads as broken rather than as a video waiting to be played.
 *
 * Same shape as the sibling mygov-video route, and for the same reasons: served
 * from our origin so no CSP change is needed, proxied from storage rather than
 * embedded so the repo carries no binary.
 */
const SOURCE =
  `${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")}` +
  "/storage/v1/object/public/email-assets/portal/mygov-poster.jpg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return new Response("Poster unavailable", { status: 503 });
  }

  const upstream = await fetch(SOURCE, { cache: "force-cache" });
  if (!upstream.ok) return new Response("Poster unavailable", { status: 502 });

  const headers = new Headers({
    "content-type": "image/jpeg",
    "cache-control": "public, max-age=31536000, immutable",
  });
  const len = upstream.headers.get("content-length");
  if (len) headers.set("content-length", len);

  return new Response(upstream.body, { status: 200, headers });
}
