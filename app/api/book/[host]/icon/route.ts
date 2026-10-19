/**
 * GET /api/book/<slug>/icon — the favicon / touch icon for a Springboard
 * booking page.
 *
 * The root layout's icon set is the NextKey key, which must not appear on a
 * page that goes to Springboard leads (brand firewall). Served under /api/book/
 * for the same reason as ./og: that prefix is public on the CRM host, and it is
 * on the allow-list of book.springboardhomes.com.au, where /favicon.ico and
 * /apple-touch-icon.png are rewritten here. NextKey hosts keep the root icons.
 */
import { NextResponse } from "next/server";
import { findHostBySlug } from "../../../../../utils/scheduling-hosts";
import { SPRINGBOARD_ICON_PNG_BASE64 } from "./icon-data";

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
  const body = Buffer.from(SPRINGBOARD_ICON_PNG_BASE64, "base64");
  return new NextResponse(body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
      "content-length": String(body.byteLength),
    },
  });
}
