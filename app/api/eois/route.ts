import { supabase } from "../../../utils/supabase";
import {
  emptyEoi,
  hydrateEoi,
  eoiSummary,
  eoiPrefill,
  eoiErrMessage,
  eoisTableMissing,
  EOI_STATUSES,
  type EoiData,
  type EoiPropertyPrefill,
  type EoiContactPrefill,
} from "../../../utils/eoi";
import { makeListHandler, makeCreateHandler, type CreateRow } from "../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

export const MIGRATION_HINT =
  "EOI storage isn't set up yet — run migrations/20260715_eois.sql in the Supabase SQL editor.";

/** List columns. Never `select("*")` — `data` holds buyer PII + contact details. */
const LIST_COLUMNS =
  "id,summary,status,property_id,opportunity_id,contact_id,purchase_price,aml_case_id,licence_uploaded_at,created_by,created_at,updated_at";

/** GET — list EOIs (newest first), omitting the `data` blob. */
export const GET = makeListHandler({
  table: "eois",
  logPrefix: "eois",
  errMessage: eoiErrMessage,
  tableMissing: eoisTableMissing,
  listColumns: LIST_COLUMNS,
  listKey: "eois",
});

const PROPERTY_PREFILL_COLUMNS =
  "id,street_address,suburb,state,estate_name,lot_number,builder_name,total_package_price,house_price";
const CONTACT_PREFILL_COLUMNS =
  "name,full_name,email,phone,home_address_street,home_address_suburb,home_address_state,home_address_postcode";

/** Best-effort prefill from a property + optional buyer contact + broker. Any
 *  read error falls back to a blank EOI so a create is never failed by prefill. */
async function prefill(
  propertyId: string | null,
  contactId: string | null,
  broker: { name?: string | null; email?: string | null } | null,
  today: string,
): Promise<EoiData> {
  let property: EoiPropertyPrefill | null = null;
  let contact: EoiContactPrefill | null = null;
  try {
    if (propertyId) {
      const { data } = await supabase.from("global_stock_pool").select(PROPERTY_PREFILL_COLUMNS).eq("id", propertyId).maybeSingle();
      if (data) property = data as EoiPropertyPrefill;
    }
  } catch { /* ignore — blank property */ }
  try {
    if (contactId) {
      const { data } = await supabase.from("contacts").select(CONTACT_PREFILL_COLUMNS).eq("id", contactId).maybeSingle();
      if (data) contact = data as EoiContactPrefill;
    }
  } catch { /* ignore — blank contact */ }
  if (!property && !contact && !broker) return { ...emptyEoi(), date: today };
  return eoiPrefill({ property, contact, broker, today });
}

/**
 * POST — create an EOI. Body may carry an explicit `data` blob (else it's
 * prefilled from `propertyId` + `contactId` + optional `broker`), plus soft-link
 * ids `propertyId`/`opportunityId`/`contactId`/`dealId`. The list columns are
 * re-derived from the blob so they can't drift.
 */
export const POST = makeCreateHandler({
  table: "eois",
  docType: "eoi",
  logPrefix: "eois",
  migrationHint: MIGRATION_HINT,
  errMessage: eoiErrMessage,
  tableMissing: eoisTableMissing,
  buildCreateRow: async (b, auth): Promise<CreateRow> => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const today = new Date().toISOString().slice(0, 10);

    const broker =
      b.broker && typeof b.broker === "object"
        ? (b.broker as { name?: string | null; email?: string | null })
        : null;

    const data = b.data
      ? hydrateEoi(b.data)
      : await prefill(str(b.propertyId), str(b.contactId), broker, today);

    const status =
      typeof b.status === "string" && (EOI_STATUSES as readonly string[]).includes(b.status) ? b.status : "Draft";

    const row = {
      summary: eoiSummary(data) || null,
      status,
      property_id: str(b.propertyId),
      opportunity_id: str(b.opportunityId),
      contact_id: str(b.contactId),
      deal_id: str(b.dealId),
      purchase_price: data.property.purchasePrice,
      data,
      created_by: auth,
    };
    return { row, status, snapshot: data };
  },
});
