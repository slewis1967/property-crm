import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { needsAnalysisErrMessage } from "../../../../../utils/needsAnalysis";
import { fetchAuditHistory } from "../../../../../utils/compliance-audit";

export const dynamic = "force-dynamic";

/**
 * GET — the audit trail for one needs analysis (newest first). Same auth as the
 * document itself; no PII snapshot is returned (fetchAuditHistory omits
 * data_snapshot). Returns [] when the audit table hasn't been created yet.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const history = await fetchAuditHistory("needs_analysis", id);
    return NextResponse.json({ ok: true, history });
  } catch (e) {
    log.error("needs_analyses.history_failed", { detail: needsAnalysisErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: needsAnalysisErrMessage(e, "History failed") }, { status: 500 });
  }
}
