import {
  applicantSummary,
  hydrateNeedsAnalysis,
  needsAnalysisErrMessage,
  needsAnalysesTableMissing,
  NEEDS_ANALYSIS_STATUSES,
} from "../../../../utils/needsAnalysis";
import {
  makeGetOneHandler,
  makePatchHandler,
  makeDeleteHandler,
  type PatchBuild,
} from "../../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Needs Analysis storage isn't set up yet — run migrations/20260710_nccp_needs_analyses.sql in the Supabase SQL editor.";

const BASE = {
  table: "nccp_needs_analyses",
  docType: "needs_analysis",
  logPrefix: "needs_analyses",
  migrationHint: MIGRATION_HINT,
  errMessage: needsAnalysisErrMessage,
  tableMissing: needsAnalysesTableMissing,
} as const;

/** GET — one needs analysis, including the full `data` blob. */
export const GET = makeGetOneHandler({
  ...BASE,
  oneColumns: "*",
  itemKey: "needsAnalysis",
  hydrate: hydrateNeedsAnalysis,
});

/**
 * PATCH — save the form. Sends the whole `data` blob (the form is a single
 * document, and partial-merging jsonb server-side would fight the client's
 * local edit state). Denormalised columns are re-derived from it here so they
 * can never drift from the blob they summarise.
 */
export const PATCH = makePatchHandler({
  ...BASE,
  buildPatch: (body, currentStatus, auth): PatchBuild => {
    const b = body as { data?: unknown; status?: string; contactId?: string | null };

    const incomingStatus =
      typeof b.status === "string" && (NEEDS_ANALYSIS_STATUSES as readonly string[]).includes(b.status)
        ? b.status
        : currentStatus;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth };

    if (b.data !== undefined) {
      const data = hydrateNeedsAnalysis(b.data);
      patch.data = data;
      patch.applicant_name = applicantSummary(data) || null;
      patch.loan_amount = data.loan_amount_sought;
    }
    if (incomingStatus !== currentStatus) patch.status = incomingStatus;
    if (b.contactId !== undefined) patch.contact_id = b.contactId || null;

    return { patch, incomingStatus, snapshot: patch.data ?? null };
  },
});

/** DELETE — remove a needs analysis. */
export const DELETE = makeDeleteHandler(BASE);
