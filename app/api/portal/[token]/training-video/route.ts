/**
 * GET /api/portal/<token>/training-video — the director ID walkthrough.
 *
 * GATED, unlike the sibling /api/portal/mygov-video. That one is help material
 * every borrower needs, so it is served openly. This one is only correct for a
 * client establishing an SMSF with a CORPORATE trustee — a client with
 * individual trustees does not need a director ID at all, and showing them this
 * would send them off to obtain one they have no obligation to hold. So a rep
 * releases it per request and until then this route 404s.
 *
 * The token is the credential (see _shared.resolveToken). We re-resolve it here
 * rather than trusting anything the caller says about which request they are.
 *
 * CACHING IS DELIBERATELY OFF. The mygov routes cache `public, immutable` at the
 * edge because the asset is world-readable. Doing that here would let a CDN keep
 * serving the bytes after a rep revoked access, and could let one token's
 * response satisfy another token's request. `private, no-store` costs a little
 * bandwidth and keeps the gate meaningful.
 *
 * Range requests are forwarded so the browser can seek.
 */
import { resolveToken, trainingVideoReleased } from "../../_shared";

const SOURCE =
  `${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")}` +
  "/storage/v1/object/public/email-assets/portal/director-id-smsf-au.mp4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  // A bad token and an unreleased video both return 404: someone poking at this
  // URL learns nothing about whether a given client exists or what stage
  // they're at.
  if (!resolved.ok) return new Response("Not found", { status: 404 });
  if (!(await trainingVideoReleased(resolved.request.id))) {
    return new Response("Not found", { status: 404 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return new Response("Video unavailable", { status: 503 });
  }

  const range = req.headers.get("range");
  const upstream = await fetch(SOURCE, { headers: range ? { range } : undefined });
  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Video unavailable", { status: 502 });
  }

  const headers = new Headers({
    "content-type": "video/mp4",
    "cache-control": "private, no-store",
    "accept-ranges": "bytes",
  });
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
