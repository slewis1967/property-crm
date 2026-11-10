/**
 * GET /api/credit-authorisations/[id]/pdf — server-generated PDF of one Credit
 * File Authorisation (Equifax Access Seeker consent form).
 *
 * Reuses the SAME on-screen print component (CreditAuthorisationPrintDocument)
 * via headless Chromium (utils/pdf/render.ts, prod-validated by the Needs
 * Analysis PDF). The existing window.print() "Print to sign" button is
 * unchanged; this ADDS an attachable, server-rendered download.
 *
 * The fetch + hydrate mirrors the GET-one handler in ../route.ts — explicit
 * columns (never `*`; `data` holds name + address PII), service-key Supabase,
 * graceful when the table is missing, 404 when the row is absent.
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import {
  creditAuthErrMessage,
  creditAuthorisationSummary,
  creditAuthorisationsTableMissing,
  hydrateCreditAuthorisation,
} from "../../../../../utils/creditAuthorisation";
import { htmlToPdf } from "../../../../../utils/pdf/render";
import { renderCreditAuthorisationHtml } from "../../../../../utils/pdf/creditAuthorisationPdf";

// Chromium needs the Node.js runtime (not edge); rendering can take several
// seconds on a cold serverless start, so give it headroom.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TABLE = "credit_authorisations";
/** Explicit columns — never `select("*")`; `data` holds name + address PII. */
const ROW_COLUMNS = "id,names,status,contact_id,deal_id,data,created_by,created_at,updated_at";
const MIGRATION_HINT =
  "Credit Authorisation storage isn't set up yet — run migrations/20260710_credit_authorisations.sql in the Supabase SQL editor.";

/** Filesystem-safe filename fragment from the applicant name (or the id). */
function safeName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return cleaned || fallback;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const { data: row, error } = await supabase.from(TABLE).select(ROW_COLUMNS).eq("id", id).maybeSingle();
    if (error) {
      if (creditAuthorisationsTableMissing(error)) {
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      }
      throw error;
    }
    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const data = hydrateCreditAuthorisation((row as Record<string, unknown>).data);
    const html = await renderCreditAuthorisationHtml(data);
    const pdf = await htmlToPdf(html);

    const filename = `credit-authorisation-${safeName(creditAuthorisationSummary(data), id)}.pdf`;
    // Copy into a fresh ArrayBuffer-backed view so the body is a plain BodyInit.
    const body = new Uint8Array(pdf);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    log.error("credit_authorisations.pdf_failed", { detail: creditAuthErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json(
      { ok: false, error: creditAuthErrMessage(e, "PDF generation failed") },
      { status: 500 },
    );
  }
}
