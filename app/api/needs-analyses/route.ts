import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { log, errInfo } from "../../../utils/logger";
import {
  applicantSummary,
  emptyNeedsAnalysis,
  hydrateNeedsAnalysis,
  needsAnalysisErrMessage,
  needsAnalysesTableMissing,
  NEEDS_ANALYSIS_STATUSES,
} from "../../../utils/needsAnalysis";
import { recordAudit } from "../../../utils/compliance-audit";

export const dynamic = "force-dynamic";

export const MIGRATION_HINT =
  "Needs Analysis storage isn't set up yet — run migrations/20260710_nccp_needs_analyses.sql in the Supabase SQL editor.";

/** Columns for the list view. Never `select("*")` here — `data` holds borrower PII. */
const LIST_COLUMNS = "id,applicant_name,status,contact_id,loan_amount,created_by,created_at,updated_at";

/** GET — list needs analyses (newest first). Omits the `data` blob. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { data, error } = await supabase
      .from("nccp_needs_analyses")
      .select(LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      if (needsAnalysesTableMissing(error)) return NextResponse.json({ ok: true, needsAnalyses: [] });
      throw error;
    }
    return NextResponse.json({ ok: true, needsAnalyses: data ?? [] });
  } catch (e) {
    log.error("needs_analyses.list_failed", { detail: needsAnalysisErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: needsAnalysisErrMessage(e, "List failed") }, { status: 500 });
  }
}

/**
 * POST — create a needs analysis. Body is optional: with no body you get a
 * blank form to open and fill in. `contactId` prefills from a contact; an
 * optional `data` blob lets a caller seed the form.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = await req.json().catch(() => ({}) as Record<string, unknown>);
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);

    const data = b.data ? hydrateNeedsAnalysis(b.data) : emptyNeedsAnalysis();
    const status =
      typeof b.status === "string" && (NEEDS_ANALYSIS_STATUSES as readonly string[]).includes(b.status)
        ? b.status
        : "Draft";

    const row = {
      applicant_name: applicantSummary(data) || null,
      status,
      contact_id: str(b.contactId),
      deal_id: str(b.dealId),
      loan_amount: data.loan_amount_sought,
      data,
      created_by: auth,
    };

    const { data: inserted, error } = await supabase.from("nccp_needs_analyses").insert(row).select("id").single();
    if (error) {
      if (needsAnalysesTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    await recordAudit({
      docType: "needs_analysis",
      docId: inserted.id,
      action: "create",
      changedBy: auth,
      statusAfter: status,
      snapshot: data,
    });
    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e) {
    log.error("needs_analyses.create_failed", { detail: needsAnalysisErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: needsAnalysisErrMessage(e, "Create failed") }, { status: 500 });
  }
}
