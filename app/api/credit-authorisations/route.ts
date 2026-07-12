import { supabase } from "../../../utils/supabase";
import {
  creditAuthErrMessage,
  creditAuthorisationSummary,
  creditAuthorisationsTableMissing,
  emptyCreditAuthorisation,
  hydrateCreditAuthorisation,
  CREDIT_AUTHORISATION_STATUSES,
} from "../../../utils/creditAuthorisation";
import { makeListHandler, makeCreateHandler, type CreateRow } from "../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

export const MIGRATION_HINT =
  "Credit Authorisation storage isn't set up yet — run migrations/20260710_credit_authorisations.sql in the Supabase SQL editor.";

/** Columns for the list view. Never `select("*")` here — `data` holds PII. */
const LIST_COLUMNS = "id,names,status,contact_id,deal_id,created_by,created_at,updated_at";

/**
 * Prefill the name/address lines from a linked contact, so the broker doesn't
 * re-key what the CRM already knows. Best-effort: any failure (or a missing
 * contact) just leaves the fields blank for the user to fill in.
 */
async function prefillFromContact(contactId: string): Promise<{ names: string; address: string }> {
  try {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "full_name,name,first_name,home_address_street,home_address_suburb,home_address_state,home_address_postcode",
      )
      .eq("id", contactId)
      .maybeSingle();
    if (error || !data) return { names: "", address: "" };
    const c = data as Record<string, string | null>;
    const names = (c.full_name || c.name || c.first_name || "").trim();
    const address = [
      c.home_address_street,
      c.home_address_suburb,
      c.home_address_state,
      c.home_address_postcode,
    ]
      .map((p) => (p ?? "").trim())
      .filter(Boolean)
      .join(", ");
    return { names, address };
  } catch {
    return { names: "", address: "" };
  }
}

/** GET — list credit authorisations (newest first). Omits the `data` blob. */
export const GET = makeListHandler({
  table: "credit_authorisations",
  logPrefix: "credit_authorisations",
  errMessage: creditAuthErrMessage,
  tableMissing: creditAuthorisationsTableMissing,
  listColumns: LIST_COLUMNS,
  listKey: "creditAuthorisations",
});

/**
 * POST — create a credit authorisation. Body is optional: with no body you get a
 * blank form. `contactId` links it to a contact and prefills the name/address
 * lines from that contact. An explicit `data` blob (if supplied) wins over the
 * contact prefill.
 */
export const POST = makeCreateHandler({
  table: "credit_authorisations",
  docType: "credit_authorisation",
  logPrefix: "credit_authorisations",
  migrationHint: MIGRATION_HINT,
  errMessage: creditAuthErrMessage,
  tableMissing: creditAuthorisationsTableMissing,
  buildCreateRow: async (b, auth): Promise<CreateRow> => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const contactId = str(b.contactId);

    const data = b.data ? hydrateCreditAuthorisation(b.data) : emptyCreditAuthorisation();
    // No explicit blob but a contact — seed the two fill-in lines from it.
    if (!b.data && contactId) {
      const prefill = await prefillFromContact(contactId);
      data.names = prefill.names;
      data.address = prefill.address;
    }
    if (typeof b.status === "string" && (CREDIT_AUTHORISATION_STATUSES as readonly string[]).includes(b.status)) {
      data.status = b.status as (typeof CREDIT_AUTHORISATION_STATUSES)[number];
    }

    const row = {
      names: creditAuthorisationSummary(data) || null,
      status: data.status,
      contact_id: contactId,
      deal_id: str(b.dealId),
      data,
      created_by: auth,
    };

    return { row, status: data.status, snapshot: data };
  },
});
