/**
 * GET /api/book/<slug>/og — the link-preview image for a Springboard booking page.
 *
 * The booking link goes out in texts and emails, and phones render its og:image
 * as a preview card. Served under /api/book/ so it inherits that prefix's
 * Cloudflare Access bypass — an image under /public sits behind the Access
 * login wall, which a preview crawler can't pass. Self-contained (base64, no
 * filesystem read), like /api/portal/logo. NextKey hosts keep the root OG card.
 */
import { NextResponse } from "next/server";
import { findHostBySlug } from "../../../../../utils/scheduling-hosts";
import { SPRINGBOARD_OG_PNG_BASE64 } from "./og-data";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ host: string }> },
) {
  const { host: slug } = await params;
  const host = findHostBySlug(slug);
  if (!host || host.brand !== "springboard") {
    return new NextResponse("Not found", { status: 404 });
  }
  const body = Buffer.from(SPRINGBOARD_OG_PNG_BASE64, "base64");
  return new NextResponse(body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
      "content-length": String(body.byteLength),
    },
  });
}
