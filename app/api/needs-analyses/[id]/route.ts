import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import {
  applicantSummary,
  hydrateNeedsAnalysis,
  needsAnalysisErrMessage,
  needsAnalysesTableMissing,
  NEEDS_ANALYSIS_STATUSES,
} from "../../../../utils/needsAnalysis";
import { classifyPatch, isLocked, recordAudit, LOCKED_EDIT_MESSAGE, LOCKED_DELETE_MESSAGE } from "../../../../utils/compliance-audit";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Needs Analysis storage isn't set up yet — run migrations/20260710_nccp_needs_analyses.sql in the Supabase SQL editor.";

/** GET — one needs analysis, including the full `data` blob. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { data, error } = await supabase.from("nccp_needs_analyses").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (needsAnalysesTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, needsAnalysis: { ...data, data: hydrateNeedsAnalysis(data.data) } });
  } catch (e) {
    log.error("needs_analyses.get_failed", { detail: needsAnalysisErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: needsAnalysisErrMessage(e, "Load failed") }, { status: 500 });
  }
}

/**
 * PATCH — save the form. Sends the whole `data` blob (the form is a single
 * document, and partial-merging jsonb server-side would fight the client's
 * local edit state). Denormalised columns are re-derived from it here so they
 * can never drift from the blob they summarise.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const b = (await req.json()) as { data?: unknown; status?: string; contactId?: string | null };

    // Fetch the current status first — the sign-lock is derived from it.
    const { data: current, error: fetchErr } = await supabase
      .from("nccp_needs_analyses")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      if (needsAnalysesTableMissing(fetchErr)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw fetchErr;
    }
    if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const currentStatus = current.status as string;
    const incomingStatus =
      typeof b.status === "string" && (NEEDS_ANALYSIS_STATUSES as readonly string[]).includes(b.status)
        ? b.status
        : currentStatus;

    const decision = classifyPatch("needs_analysis", currentStatus, incomingStatus);
    if (decision.kind === "reject") {
      return NextResponse.json({ ok: false, error: LOCKED_EDIT_MESSAGE }, { status: 409 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth };

    if (b.data !== undefined) {
      const data = hydrateNeedsAnalysis(b.data);
      patch.data = data;
      patch.applicant_name = applicantSummary(data) || null;
      patch.loan_amount = data.loan_amount_sought;
    }
    if (incomingStatus !== currentStatus) patch.status = incomingStatus;
    if (b.contactId !== undefined) patch.contact_id = b.contactId || null;

    const { error } = await supabase.from("nccp_needs_analyses").update(patch).eq("id", id);
    if (error) {
      if (needsAnalysesTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    await recordAudit({
      docType: "needs_analysis",
      docId: id,
      action: decision.kind,
      changedBy: auth,
      statusAfter: incomingStatus,
      snapshot: patch.data ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("needs_analyses.update_failed", { detail: needsAnalysisErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: needsAnalysisErrMessage(e, "Save failed") }, { status: 500 });
  }
}

/** DELETE — remove a needs analysis. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    // Fetch the row first: a locked (Complete) document can't be deleted, and we
    // snapshot its final state into the audit log before removing it.
    const { data: current, error: fetchErr } = await supabase
      .from("nccp_needs_analyses")
      .select("status,data")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      if (needsAnalysesTableMissing(fetchErr)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw fetchErr;
    }
    if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (isLocked("needs_analysis", current.status as string)) {
      return NextResponse.json({ ok: false, error: LOCKED_DELETE_MESSAGE }, { status: 409 });
    }

    const { error } = await supabase.from("nccp_needs_analyses").delete().eq("id", id);
    if (error) throw error;
    await recordAudit({
      docType: "needs_analysis",
      docId: id,
      action: "delete",
      changedBy: auth,
      statusAfter: current.status as string,
      snapshot: current.data,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("needs_analyses.delete_failed", { detail: needsAnalysisErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: needsAnalysisErrMessage(e, "Delete failed") }, { status: 500 });
  }
}
