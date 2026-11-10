/**
 * GET /api/portal/logo  — the Springboard Homes logo as a PNG.
 *
 * Served under /api/portal/ so it inherits that prefix's Cloudflare Access
 * bypass + proxy.ts exemption (same as /api/portal/mygov-guide): it needs to be
 * publicly fetchable by email clients (Gmail image proxy) and by the public
 * upload portal, neither of which carries a CF Access identity. Self-contained
 * (base64, no filesystem read) so it can't break on a serverless cold path.
 */
import { NextResponse } from "next/server";
import { SPRINGBOARD_LOGO_PNG_BASE64 } from "./logo-data";

export const runtime = "nodejs";

export async function GET() {
  const body = Buffer.from(SPRINGBOARD_LOGO_PNG_BASE64, "base64");
  return new NextResponse(body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(body.byteLength),
    },
  });
}
