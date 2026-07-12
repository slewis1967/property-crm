import {
  applicantSummary,
  emptyNeedsAnalysis,
  hydrateNeedsAnalysis,
  needsAnalysisErrMessage,
  needsAnalysesTableMissing,
  NEEDS_ANALYSIS_STATUSES,
} from "../../../utils/needsAnalysis";
import { makeListHandler, makeCreateHandler, type CreateRow } from "../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

export const MIGRATION_HINT =
  "Needs Analysis storage isn't set up yet — run migrations/20260710_nccp_needs_analyses.sql in the Supabase SQL editor.";

/** Columns for the list view. Never `select("*")` here — `data` holds borrower PII. */
const LIST_COLUMNS = "id,applicant_name,status,contact_id,loan_amount,created_by,created_at,updated_at";

/** GET — list needs analyses (newest first). Omits the `data` blob. */
export const GET = makeListHandler({
  table: "nccp_needs_analyses",
  logPrefix: "needs_analyses",
  errMessage: needsAnalysisErrMessage,
  tableMissing: needsAnalysesTableMissing,
  listColumns: LIST_COLUMNS,
  listKey: "needsAnalyses",
});

/**
 * POST — create a needs analysis. Body is optional: with no body you get a
 * blank form to open and fill in. `contactId` prefills from a contact; an
 * optional `data` blob lets a caller seed the form.
 */
export const POST = makeCreateHandler({
  table: "nccp_needs_analyses",
  docType: "needs_analysis",
  logPrefix: "needs_analyses",
  migrationHint: MIGRATION_HINT,
  errMessage: needsAnalysisErrMessage,
  tableMissing: needsAnalysesTableMissing,
  buildCreateRow: (b, auth): CreateRow => {
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

    return { row, status, snapshot: data };
  },
});
