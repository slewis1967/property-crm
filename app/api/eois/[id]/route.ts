import {
  hydrateEoi,
  eoiSummary,
  eoiErrMessage,
  eoisTableMissing,
  EOI_STATUSES,
} from "../../../../utils/eoi";
import {
  makeGetOneHandler,
  makePatchHandler,
  makeDeleteHandler,
  type PatchBuild,
} from "../../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "EOI storage isn't set up yet — run migrations/20260715_eois.sql in the Supabase SQL editor.";

const BASE = {
  table: "eois",
  docType: "eoi",
  logPrefix: "eois",
  migrationHint: MIGRATION_HINT,
  errMessage: eoiErrMessage,
  tableMissing: eoisTableMissing,
} as const;

/** GET — one EOI, including the full `data` blob. */
export const GET = makeGetOneHandler({
  ...BASE,
  oneColumns: "*",
  itemKey: "eoi",
  hydrate: hydrateEoi,
});

/**
 * PATCH — save the EOI. The whole `data` blob is sent; denormalised columns
 * (summary, purchase_price) are re-derived from it. Moving to/from "Signed" is
 * handled by the shared sign-lock: a Signed EOI is read-only until reopened.
 */
export const PATCH = makePatchHandler({
  ...BASE,
  buildPatch: (body, currentStatus, auth): PatchBuild => {
    const b = body as {
      data?: unknown;
      status?: string;
      propertyId?: string | null;
      opportunityId?: string | null;
      contactId?: string | null;
    };

    const incomingStatus =
      typeof b.status === "string" && (EOI_STATUSES as readonly string[]).includes(b.status) ? b.status : currentStatus;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth };

    if (b.data !== undefined) {
      const data = hydrateEoi(b.data);
      patch.data = data;
      patch.summary = eoiSummary(data) || null;
      patch.purchase_price = data.property.purchasePrice;
    }
    if (incomingStatus !== currentStatus) patch.status = incomingStatus;
    if (b.propertyId !== undefined) patch.property_id = b.propertyId || null;
    if (b.opportunityId !== undefined) patch.opportunity_id = b.opportunityId || null;
    if (b.contactId !== undefined) patch.contact_id = b.contactId || null;

    return { patch, incomingStatus, snapshot: patch.data ?? null };
  },
});

/** DELETE — remove an EOI (blocked once Signed/locked). */
export const DELETE = makeDeleteHandler(BASE);
