import {
  emptyAmlCase,
  hydrateAmlCase,
  partySummary,
  deriveRiskRating,
  amlErrMessage,
  amlTableMissing,
  AML_CASE_STATUSES,
  PARTY_TYPES,
  type PartyType,
} from "../../../../utils/aml";
import { makeListHandler, makeCreateHandler, type CreateRow } from "../../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

export const MIGRATION_HINT =
  "AML storage isn't set up yet — run migrations/20260715_aml.sql in the Supabase SQL editor.";

/** List columns. Never `select("*")` — `data` holds CDD PII. */
const LIST_COLUMNS =
  "id,party_name,party_type,party_role,status,risk_rating,screening_status,contact_id,deal_id,created_by,created_at,updated_at";

/** GET — list CDD cases (newest first), omitting the `data` blob. */
export const GET = makeListHandler({
  table: "aml_cases",
  logPrefix: "aml_cases",
  errMessage: amlErrMessage,
  tableMissing: amlTableMissing,
  listColumns: LIST_COLUMNS,
  listKey: "cases",
});

/**
 * POST — create a CDD case. Body may carry an explicit `data` blob (else a blank
 * case is created for the given `partyType`), plus optional `contactId`/`dealId`/
 * `leadId` soft links to the party and transaction. The risk rating is always
 * re-derived from the blob so the denormalised column can't drift.
 */
export const POST = makeCreateHandler({
  table: "aml_cases",
  docType: "aml_case",
  logPrefix: "aml_cases",
  migrationHint: MIGRATION_HINT,
  errMessage: amlErrMessage,
  tableMissing: amlTableMissing,
  buildCreateRow: (b, auth): CreateRow => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const partyType: PartyType =
      typeof b.partyType === "string" && (PARTY_TYPES as readonly string[]).includes(b.partyType)
        ? (b.partyType as PartyType)
        : "individual";

    const data = b.data ? hydrateAmlCase(b.data) : emptyAmlCase(partyType);
    data.riskRating = deriveRiskRating(data);

    const status =
      typeof b.status === "string" && (AML_CASE_STATUSES as readonly string[]).includes(b.status)
        ? b.status
        : "Draft";

    const row = {
      party_name: partySummary(data) || null,
      party_type: data.partyType,
      party_role: data.partyRole,
      status,
      risk_rating: data.riskRating,
      screening_status: data.screening.status,
      contact_id: str(b.contactId),
      deal_id: str(b.dealId),
      lead_id: str(b.leadId),
      data,
      created_by: auth,
    };
    return { row, status, snapshot: data };
  },
});
