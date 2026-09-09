/**
 * PUBLIC signing endpoint — TOKEN-AUTHENTICATED, NO requireAuth.
 *
 * GET /api/sign/[token]
 *   The signing page loads its state from here. We hash the presented token and
 *   look it up; a miss, an expired request, or an already-terminal request all
 *   return a GENERIC state with no information about why (no info leak — an
 *   attacker probing tokens can't tell "wrong token" from "expired"). On the
 *   first valid view we flip status sent→viewed. We return ONLY what the page
 *   needs: the signer's own name, the doc type + friendly label, and the state.
 *   Never other signers' data, never the document's internal id.
 *
 * INTERNET-FACING — treat every input as hostile. Rate-limited by token+IP.
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { enforceRateLimit } from "../../../../utils/rate-limit";
import { log } from "../../../../utils/logger";
import { isExpired, isTerminalStatus, DOC_TYPE_LABEL } from "../../../../utils/signatures";
import {
  SIGNATURE_REQUESTS_TABLE,
  findRequestByToken,
} from "../../../../utils/signature-requests-db";
import { clientIp, rateKeyFromToken } from "../_shared";
import { signBrand } from "../../../../utils/sign-brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The state the signing page renders. All non-`ready` states share one shape. */
type PublicState = "ready" | "signed" | "declined" | "expired" | "invalid";

function stateResponse(state: PublicState, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: true, state, ...extra });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 30, keyFn: () => rateKeyFromToken(req, token) });
  if (limited) return limited;

  try {
    const found = await findRequestByToken(token);
    if (!found.ok) {
      // Missing table or missing token → same generic invalid state.
      return stateResponse("invalid");
    }
    const row = found.row;

    /* The brand travels with EVERY state, not just "ready". Someone reopening a
     * link they already signed, or one that has expired, still sees a page with
     * a company's name at the top of it — and it should be the company they
     * dealt with. An unknown TOKEN gets no brand, correctly: we do not know who
     * they are, so there is nothing to claim. */
    const brand = { brand: signBrand(row.brand) };

    if (row.status === "signed") return stateResponse("signed", brand);
    if (row.status === "declined") return stateResponse("declined", brand);
    if (row.status === "expired" || isExpired(row.expires_at, Date.now())) {
      return stateResponse("expired", brand);
    }
    // Any other terminal status we don't explicitly render → generic invalid.
    if (isTerminalStatus(row.status)) return stateResponse("invalid", brand);

    // First valid view: sent → viewed (idempotent; don't clobber a later status).
    if (row.status === "sent") {
      await supabase
        .from(SIGNATURE_REQUESTS_TABLE)
        .update({ status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "sent");
    }

    return stateResponse("ready", {
      signer_name: row.signer_name ?? "",
      doc_type: row.doc_type,
      doc_label: DOC_TYPE_LABEL[row.doc_type] ?? "Document",
      /* Which business the signer sees. Carried on the request rather than
       * derived from doc_type: the same document can belong to either business,
       * and a Springboard client must not be asked to sign under NextKey's
       * letterhead. */
      ...brand,
    });
  } catch (e) {
    // Never leak internals to the public page.
    log.error("sign.view_failed", { message: e instanceof Error ? e.message : String(e), ip: clientIp(req) });
    return NextResponse.json({ ok: false, state: "error" }, { status: 500 });
  }
}
