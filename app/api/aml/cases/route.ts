import { supabase } from "../../../../utils/supabase";
import {
  emptyAmlCase,
  hydrateAmlCase,
  partySummary,
  deriveRiskRating,
  amlErrMessage,
  amlTableMissing,
  AML_CASE_STATUSES,
  PARTY_TYPES,
  type AmlCaseData,
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
 * Prefill the acting individual's identity (name, DOB, residential address) from
 * a linked contact, so the officer doesn't re-key what the CRM already holds —
 * the same fields the Needs Analysis writes onto a contact when it completes.
 * Best-effort: any failure (or missing contact) just leaves the fields blank.
 */
async function prefillFromContact(contactId: string, data: AmlCaseData): Promise<void> {
  try {
    const { data: c, error } = await supabase
      .from("contacts")
      .select(
        "full_name,name,first_name,date_of_birth,home_address_street,home_address_suburb,home_address_state,home_address_postcode",
      )
      .eq("id", contactId)
      .maybeSingle();
    if (error || !c) return;
    const g = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const name = g(c.full_name) || g(c.name) || g(c.first_name);
    if (name) data.entity.fullLegalName = name;
    if (g(c.date_of_birth)) data.entity.dob = g(c.date_of_birth);
    const addr = data.entity.residentialAddress;
    if (g(c.home_address_street)) addr.line1 = g(c.home_address_street);
    if (g(c.home_address_suburb)) addr.suburb = g(c.home_address_suburb);
    if (g(c.home_address_state)) addr.state = g(c.home_address_state);
    if (g(c.home_address_postcode)) addr.postcode = g(c.home_address_postcode);
  } catch {
    /* leave blank — prefill is best-effort */
  }
}

/**
 * POST — create a CDD case. Body may carry an explicit `data` blob (else a blank
 * case is created for the given `partyType`), plus optional `contactId`/`dealId`/
 * `leadId` soft links to the party and transaction. When a `contactId` is given
 * without an explicit blob, the acting individual's identity is prefilled from
 * that contact. The risk rating is always re-derived so the column can't drift.
 */
export const POST = makeCreateHandler({
  table: "aml_cases",
  docType: "aml_case",
  logPrefix: "aml_cases",
  migrationHint: MIGRATION_HINT,
  errMessage: amlErrMessage,
  tableMissing: amlTableMissing,
  buildCreateRow: async (b, auth): Promise<CreateRow> => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const partyType: PartyType =
      typeof b.partyType === "string" && (PARTY_TYPES as readonly string[]).includes(b.partyType)
        ? (b.partyType as PartyType)
        : "individual";

    const data = b.data ? hydrateAmlCase(b.data) : emptyAmlCase(partyType);
    const contactId = str(b.contactId);
    if (!b.data && contactId) await prefillFromContact(contactId, data);
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
      contact_id: contactId,
      deal_id: str(b.dealId),
      lead_id: str(b.leadId),
      data,
      created_by: auth,
    };
    return { row, status, snapshot: data };
  },
});
