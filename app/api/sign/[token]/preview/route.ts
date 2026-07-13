/**
 * PUBLIC unsigned-document preview — TOKEN-AUTHENTICATED, NO requireAuth.
 *
 * GET /api/sign/[token]/preview
 *   Returns the UNSIGNED PDF of the ONE document this token is tied to, so the
 *   signing page can show the signer what they're about to sign WITHOUT exposing
 *   the authed /api/{doc}s/[id]/pdf route to the public. The token scopes access
 *   to exactly one document — a signer can never request another document's PDF.
 *
 * INTERNET-FACING — rate-limited; generic 404 on any invalid/expired token so no
 * information leaks about which tokens exist.
 */

import { NextResponse } from "next/server";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { log } from "../../../../../utils/logger";
import { isExpired, isTerminalStatus } from "../../../../../utils/signatures";
import { findRequestByToken } from "../../../../../utils/signature-requests-db";
import { loadDoc } from "../../../../../utils/sign-doc-render";
import { htmlToPdf } from "../../../../../utils/pdf/render";
import { rateKeyFromToken, clientIp } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function notAvailable(): NextResponse {
  return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 15, keyFn: () => rateKeyFromToken(req, token) });
  if (limited) return limited;

  try {
    const found = await findRequestByToken(token);
    if (!found.ok) return notAvailable();
    const row = found.row;

    // Don't render previews for expired/declined tokens. A signed token can still
    // preview the (now unsigned base) document — harmless and keeps the "download
    // your copy" affordance working, but the SIGNED copy is fetched separately.
    if (row.status === "declined" || row.status === "expired" || isExpired(row.expires_at, Date.now())) {
      return notAvailable();
    }
    if (isTerminalStatus(row.status) && row.status !== "signed") return notAvailable();

    const doc = await loadDoc(row.doc_type, row.doc_id);
    if (!doc) return notAvailable();

    const html = await doc.renderHtml(); // no signatures — the unsigned preview
    const pdf = await htmlToPdf(html);
    const body = new Uint8Array(pdf);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=\"document-preview.pdf\"",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    log.error("sign.preview_failed", { message: e instanceof Error ? e.message : String(e), ip: clientIp(req) });
    return NextResponse.json({ ok: false, error: "Preview failed" }, { status: 500 });
  }
}
