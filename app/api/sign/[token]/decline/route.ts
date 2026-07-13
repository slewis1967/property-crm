/**
 * PUBLIC signing decline — TOKEN-AUTHENTICATED, NO requireAuth.
 *
 * POST /api/sign/[token]/decline
 *   Body: { reason?: string }
 *   Marks this signer's request declined + stores the reason, then notifies the
 *   advisor. Idempotent-ish: a declined/terminal request is left as-is.
 *
 * INTERNET-FACING — rate-limited; generic errors.
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { log } from "../../../../../utils/logger";
import { isTerminalStatus, isExpired, DOC_TYPE_LABEL } from "../../../../../utils/signatures";
import {
  SIGNATURE_REQUESTS_TABLE,
  findRequestByToken,
} from "../../../../../utils/signature-requests-db";
import { sendBrevoEmail } from "../../../../../utils/brevo";
import { clientIp, rateKeyFromToken } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 10, keyFn: () => rateKeyFromToken(req, token) });
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";

    const found = await findRequestByToken(token);
    if (!found.ok) {
      return NextResponse.json({ ok: false, error: "This signing link is no longer valid." }, { status: 400 });
    }
    const row = found.row;

    if (row.status === "signed") {
      return NextResponse.json({ ok: false, error: "This document has already been signed." }, { status: 409 });
    }
    if (isTerminalStatus(row.status) || isExpired(row.expires_at, Date.now())) {
      // Already terminal (declined/expired) — treat as success, nothing to do.
      return NextResponse.json({ ok: true });
    }

    const { error: updErr } = await supabase
      .from(SIGNATURE_REQUESTS_TABLE)
      .update({ status: "declined", decline_reason: reason || null })
      .eq("id", row.id)
      .neq("status", "signed");
    if (updErr) throw updErr;

    if (row.created_by) {
      const label = DOC_TYPE_LABEL[row.doc_type] ?? "document";
      const res = await sendBrevoEmail({
        to: [{ email: row.created_by }],
        subject: `Signature declined: ${label}`,
        html: `<p>${escapeHtml(row.signer_email)} declined to sign their ${escapeHtml(label)}.</p>${
          reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : ""
        }`,
        tags: ["e-signature", "declined"],
      });
      if (!res.ok) log.warn("sign.decline_notify_failed", { error: res.error });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("sign.decline_failed", { message: e instanceof Error ? e.message : String(e), ip: clientIp(req) });
    return NextResponse.json({ ok: false, error: "Could not record your response." }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
