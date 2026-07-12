/**
 * GET /api/needs-analyses/[id]/pdf — server-generated PDF of one NCCP Needs
 * Analysis, in the exact "Your Loan Assist" layout.
 *
 * Reuses the SAME on-screen print component (NeedsAnalysisPrintDocument) via
 * headless Chromium, so the file is byte-identical to the browser's print
 * preview — see utils/pdf/render.ts and utils/pdf/needsAnalysisPdf.tsx. The
 * existing window.print() "Export PDF" button is unchanged; this ADDS an
 * attachable, server-rendered download.
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
  hydrateNeedsAnalysis,
  needsAnalysisErrMessage,
  needsAnalysesTableMissing,
} from "../../../../../utils/needsAnalysis";
import { htmlToPdf } from "../../../../../utils/pdf/render";
import { needsAnalysisHtmlWithLogo } from "../../../../../utils/pdf/needsAnalysisPdf";

// Chromium needs the Node.js runtime (not edge); rendering can take several
// seconds on a cold serverless start, so give it headroom.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TABLE = "nccp_needs_analyses";
const MIGRATION_HINT =
  "Needs Analysis storage isn't set up yet — run migrations/20260710_nccp_needs_analyses.sql in the Supabase SQL editor.";

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
      if (needsAnalysesTableMissing(error)) {
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      }
      throw error;
    }
    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const data = hydrateNeedsAnalysis((row as Record<string, unknown>).data);
    const html = await needsAnalysisHtmlWithLogo(data);
    const pdf = await htmlToPdf(html);

    const filename = `needs-analysis-${safeName(applicantSummary(data), id)}.pdf`;
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
    log.error("needs_analyses.pdf_failed", { detail: needsAnalysisErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: needsAnalysisErrMessage(e, "PDF generation failed") }, { status: 500 });
  }
}
