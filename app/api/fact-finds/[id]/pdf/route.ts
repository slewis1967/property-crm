/**
 * GET /api/fact-finds/[id]/pdf — server-generated PDF of one Borrower Fact Find.
 *
 * Reuses the SAME on-screen print component (FactFindPrintDocument) via headless
 * Chromium (utils/pdf/render.ts, prod-validated by the Needs Analysis PDF), so
 * the file matches the browser's print preview. The existing window.print()
 * "Export PDF" button is unchanged; this ADDS an attachable, server-rendered
 * download.
 *
 * The fetch + hydrate mirrors the GET-one handler in ../route.ts (service-key
 * Supabase, graceful when the table is missing, 404 when the row is absent).
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import {
  applicantSummary,
  factFindErrMessage,
  factFindsTableMissing,
  hydrateFactFind,
} from "../../../../../utils/factfind";
import { htmlToPdf } from "../../../../../utils/pdf/render";
import { renderFactFindHtml } from "../../../../../utils/pdf/factFindPdf";

// Chromium needs the Node.js runtime (not edge); rendering can take several
// seconds on a cold serverless start, so give it headroom.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TABLE = "borrower_fact_finds";
const MIGRATION_HINT =
  "Fact Find storage isn't set up yet — run migrations/20260709_borrower_fact_finds.sql in the Supabase SQL editor.";

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
    const { data: row, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) {
      if (factFindsTableMissing(error)) {
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      }
      throw error;
    }
    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const data = hydrateFactFind((row as Record<string, unknown>).data);
    const html = await renderFactFindHtml(data);
    const pdf = await htmlToPdf(html);

    const filename = `fact-find-${safeName(applicantSummary(data), id)}.pdf`;
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
    log.error("fact_finds.pdf_failed", { detail: factFindErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: factFindErrMessage(e, "PDF generation failed") }, { status: 500 });
  }
}
