import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { factFindErrMessage } from "../../../../../utils/factfind";
import { fetchAuditHistory } from "../../../../../utils/compliance-audit";

export const dynamic = "force-dynamic";

/**
 * GET — the audit trail for one fact find (newest first). Same auth as the
 * document itself: the rows describe who changed what and when (no PII snapshot
 * is returned — fetchAuditHistory omits data_snapshot). Returns [] when the
 * audit table hasn't been created yet, so the history panel degrades gracefully.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const history = await fetchAuditHistory("fact_find", id);
    return NextResponse.json({ ok: true, history });
  } catch (e) {
    log.error("fact_finds.history_failed", { detail: factFindErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: factFindErrMessage(e, "History failed") }, { status: 500 });
  }
}
