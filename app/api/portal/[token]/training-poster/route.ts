/**
 * GET /api/portal/<token>/training-poster — title card for the director ID
 * walkthrough. Without it the player opens on black, which reads as broken.
 *
 * Gated on the same release flag as the video itself. The poster is only a
 * branded title card and leaks nothing on its own, but gating it keeps one rule
 * for the whole feature: if the rep has not released the walkthrough, none of
 * its assets are reachable. One rule is easier to keep correct than two.
 */
import { resolveToken, trainingVideoReleased } from "../../_shared";

const SOURCE =
  `${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")}` +
  "/storage/v1/object/public/email-assets/portal/director-id-poster.jpg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (!resolved.ok) return new Response("Not found", { status: 404 });
  if (!(await trainingVideoReleased(resolved.request.id))) {
    return new Response("Not found", { status: 404 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return new Response("Poster unavailable", { status: 503 });
  }

  const upstream = await fetch(SOURCE);
  if (!upstream.ok) return new Response("Poster unavailable", { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, no-store",
    },
  });
}
