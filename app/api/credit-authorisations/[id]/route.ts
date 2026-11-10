import {
  creditAuthErrMessage,
  creditAuthorisationSummary,
  creditAuthorisationsTableMissing,
  hydrateCreditAuthorisation,
} from "../../../../utils/creditAuthorisation";
import {
  makeGetOneHandler,
  makePatchHandler,
  makeDeleteHandler,
  type PatchBuild,
} from "../../../../utils/compliance-doc-route";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Credit Authorisation storage isn't set up yet — run migrations/20260710_credit_authorisations.sql in the Supabase SQL editor.";

/** Explicit columns — never `select("*")`; `data` holds name + address PII. */
const ROW_COLUMNS = "id,names,status,contact_id,deal_id,data,created_by,created_at,updated_at";

const BASE = {
  table: "credit_authorisations",
  docType: "credit_authorisation",
  logPrefix: "credit_authorisations",
  migrationHint: MIGRATION_HINT,
  errMessage: creditAuthErrMessage,
  tableMissing: creditAuthorisationsTableMissing,
} as const;

/** GET — one credit authorisation, including the full `data` blob. */
export const GET = makeGetOneHandler({
  ...BASE,
  oneColumns: ROW_COLUMNS,
  itemKey: "creditAuthorisation",
  hydrate: hydrateCreditAuthorisation,
});

/**
 * PATCH — save the form. Sends the whole `data` blob (the form is a single
 * document). The denormalised `names`/`status` columns are re-derived from it
 * here so they can never drift from the blob they summarise. For this document
 * the status lives inside the `data` blob (data.status), which the top-level
 * `status` column mirrors on every save.
 */
export const PATCH = makePatchHandler({
  ...BASE,
  buildPatch: (body, currentStatus, auth): PatchBuild => {
    const b = body as { data?: unknown; contactId?: string | null };

    const hydrated = b.data !== undefined ? hydrateCreditAuthorisation(b.data) : undefined;
    const incomingStatus = hydrated ? hydrated.status : currentStatus;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth };

    if (hydrated) {
      patch.data = hydrated;
      patch.names = creditAuthorisationSummary(hydrated) || null;
      patch.status = hydrated.status;
    }
    if (b.contactId !== undefined) patch.contact_id = b.contactId || null;

    return { patch, incomingStatus, snapshot: hydrated ?? null };
  },
});

/** DELETE — remove a credit authorisation. */
export const DELETE = makeDeleteHandler(BASE);
