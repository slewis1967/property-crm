/**
 * GET /api/portal/mygov-video — PUBLIC (under the CF-Access-bypassed
 * /api/portal/* namespace), same as the sibling mygov-guide PDF route.
 *
 * Serves the Springboard myGov walkthrough to a borrower on the public portal.
 *
 * WHY IT IS PROXIED RATHER THAN LINKED. The video lives in Supabase storage, but
 * pointing <video src> straight at that host would need `media-src https://*.supabase.co`
 * added to the CSP. Serving it from our own origin needs no CSP change at all,
 * which is the better trade for a page that also handles identity documents.
 *
 * WHY NOT BASE64-EMBEDDED like the PDF: that trick suits a ~240KB file. At 2.3MB
 * it would mean a 3MB TypeScript source file in the repo, slowing lint and every
 * build, for an asset that never changes.
 *
 * RANGE REQUESTS are forwarded verbatim so the browser can seek — without that,
 * dragging the scrubber re-downloads from the start or simply doesn't work.
 */
const SOURCE =
  `${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")}` +
  "/storage/v1/object/public/email-assets/portal/mygov-income-statement-au.mp4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return new Response("Video unavailable", { status: 503 });
  }

  const range = req.headers.get("range");
  const upstream = await fetch(SOURCE, {
    headers: range ? { range } : undefined,
    // The asset is immutable; let the platform cache it hard.
    cache: "force-cache",
  });
  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Video unavailable", { status: 502 });
  }

  const headers = new Headers({
    "content-type": "video/mp4",
    // Immutable content at a stable path — cache for a year at the edge and in
    // the browser, so the function runs approximately never.
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
  });
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
