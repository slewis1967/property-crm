import { eoiErrMessage } from "../../../../../utils/eoi";
import { makeHistoryHandler } from "../../../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

/** GET — the audit trail for one EOI (newest first, no PII snapshot). */
export const GET = makeHistoryHandler({
  docType: "eoi",
  logPrefix: "eois",
  errMessage: eoiErrMessage,
});
