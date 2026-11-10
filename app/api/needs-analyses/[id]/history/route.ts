import { needsAnalysisErrMessage } from "../../../../../utils/needsAnalysis";
import { makeHistoryHandler } from "../../../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

/**
 * GET — the audit trail for one needs analysis (newest first). Same auth as the
 * document itself; no PII snapshot is returned (fetchAuditHistory omits
 * data_snapshot). Returns [] when the audit table hasn't been created yet.
 */
export const GET = makeHistoryHandler({
  docType: "needs_analysis",
  logPrefix: "needs_analyses",
  errMessage: needsAnalysisErrMessage,
});
