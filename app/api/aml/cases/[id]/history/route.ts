import { amlErrMessage } from "../../../../../../utils/aml";
import { makeHistoryHandler } from "../../../../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

/** GET — the audit trail for one CDD case (newest first, no PII snapshot). */
export const GET = makeHistoryHandler({
  docType: "aml_case",
  logPrefix: "aml_cases",
  errMessage: amlErrMessage,
});
