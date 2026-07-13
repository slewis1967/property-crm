import { supabase } from "../../../utils/supabase";
import {
  applicantSummary,
  emptyNeedsAnalysis,
  hydrateNeedsAnalysis,
  needsAnalysisErrMessage,
  needsAnalysesTableMissing,
  NEEDS_ANALYSIS_STATUSES,
  type NeedsAnalysisData,
} from "../../../utils/needsAnalysis";
import { factFindFromContact, type FactFindContact } from "../../../utils/factfind";
import { factFindToNeedsAnalysis } from "../../../utils/factFindToNeedsAnalysis";
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

/** Columns mapped onto the applicant. Explicit select — never `*` (borrower PII). */
const CONTACT_PREFILL_COLUMNS =
  "name,full_name,first_name,email,phone,date_of_birth," +
  "home_address_street,home_address_suburb,home_address_state,home_address_postcode," +
  "occupation,annual_income,hecs_balance";

/**
 * Build a needs analysis seeded from a contact's personal details. The contact
 * is mapped onto a blank applicant via the existing contact→applicant bridge
 * (factFindFromContact) and carried onto the Needs Analysis shape by
 * factFindToNeedsAnalysis — so surname/given names, date of birth, current
 * address, phone and email flow through, and the mapping stays identical to the
 * opportunity path. Best-effort: an unresolved id or any read error falls back
 * to a blank form, so a create is never failed by prefill.
 */
async function prefillFromContact(contactId: string): Promise<NeedsAnalysisData> {
  try {
    const { data: contact, error } = await supabase
      .from("contacts")
      .select(CONTACT_PREFILL_COLUMNS)
      .eq("id", contactId)
      .maybeSingle();
    if (error || !contact) return emptyNeedsAnalysis();
    return factFindToNeedsAnalysis(factFindFromContact(contact as FactFindContact)).data;
  } catch {
    return emptyNeedsAnalysis();
  }
}

/**
 * POST — create a needs analysis. Body is optional: with no body you get a
 * blank form to open and fill in. When `contactId` is provided (and no explicit
 * `data` blob is sent), the first applicant's personal details are prefilled
 * from that contact. An explicit `data` blob — e.g. the Fact-Find-derived blob
 * the opportunity path sends — always wins.
 */
export const POST = makeCreateHandler({
  table: "nccp_needs_analyses",
  docType: "needs_analysis",
  logPrefix: "needs_analyses",
  migrationHint: MIGRATION_HINT,
  errMessage: needsAnalysisErrMessage,
  tableMissing: needsAnalysesTableMissing,
  buildCreateRow: async (b, auth): Promise<CreateRow> => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);

    const contactId = str(b.contactId);
    // An explicit `data` blob wins; otherwise a contactId prefills; otherwise blank.
    const data = b.data
      ? hydrateNeedsAnalysis(b.data)
      : contactId
        ? await prefillFromContact(contactId)
        : emptyNeedsAnalysis();
    const status =
      typeof b.status === "string" && (NEEDS_ANALYSIS_STATUSES as readonly string[]).includes(b.status)
        ? b.status
        : "Draft";

    const row = {
      applicant_name: applicantSummary(data) || null,
      status,
      contact_id: contactId,
      deal_id: str(b.dealId),
      loan_amount: data.loan_amount_sought,
      data,
      created_by: auth,
    };

    return { row, status, snapshot: data };
  },
});
