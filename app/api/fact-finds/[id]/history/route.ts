import { factFindErrMessage } from "../../../../../utils/factfind";
import { makeHistoryHandler } from "../../../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

/**
 * GET — the audit trail for one fact find (newest first). Same auth as the
 * document itself: the rows describe who changed what and when (no PII snapshot
 * is returned — fetchAuditHistory omits data_snapshot). Returns [] when the
 * audit table hasn't been created yet, so the history panel degrades gracefully.
 */
export const GET = makeHistoryHandler({
  docType: "fact_find",
  logPrefix: "fact_finds",
  errMessage: factFindErrMessage,
});
