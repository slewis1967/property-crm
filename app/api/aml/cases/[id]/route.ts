import {
  hydrateAmlCase,
  partySummary,
  deriveRiskRating,
  amlErrMessage,
  amlTableMissing,
  AML_CASE_STATUSES,
} from "../../../../../utils/aml";
import {
  makeGetOneHandler,
  makePatchHandler,
  makeDeleteHandler,
  type PatchBuild,
} from "../../../../../utils/compliance-doc-route";
import { syncAmlCaseContacts } from "../../../../../utils/contact-sync";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "AML storage isn't set up yet — run migrations/20260715_aml.sql in the Supabase SQL editor.";

const BASE = {
  table: "aml_cases",
  docType: "aml_case",
  logPrefix: "aml_cases",
  migrationHint: MIGRATION_HINT,
  errMessage: amlErrMessage,
  tableMissing: amlTableMissing,
} as const;

/** GET — one CDD case, including the full `data` blob. */
export const GET = makeGetOneHandler({
  ...BASE,
  oneColumns: "*",
  itemKey: "case",
  hydrate: hydrateAmlCase,
});

/**
 * PATCH — save the case. The whole `data` blob is sent; denormalised columns
 * (party_name, party_type, risk_rating, screening_status) are re-derived from it
 * so they can't drift. Moving to/from "Cleared" is handled by the shared
 * sign-lock: a Cleared case is read-only until reopened, and every change is
 * recorded in the audit trail.
 */
export const PATCH = makePatchHandler({
  ...BASE,
  buildPatch: (body, currentStatus, auth): PatchBuild => {
    const b = body as {
      data?: unknown;
      status?: string;
      contactId?: string | null;
      dealId?: string | null;
    };

    const incomingStatus =
      typeof b.status === "string" && (AML_CASE_STATUSES as readonly string[]).includes(b.status)
        ? b.status
        : currentStatus;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth };

    if (b.data !== undefined) {
      const data = hydrateAmlCase(b.data);
      data.riskRating = deriveRiskRating(data);
      patch.data = data;
      patch.party_name = partySummary(data) || null;
      patch.party_type = data.partyType;
      patch.party_role = data.partyRole;
      patch.risk_rating = data.riskRating;
      patch.screening_status = data.screening.status;
    }
    if (incomingStatus !== currentStatus) patch.status = incomingStatus;
    if (b.contactId !== undefined) patch.contact_id = b.contactId || null;
    if (b.dealId !== undefined) patch.deal_id = b.dealId || null;

    return { patch, incomingStatus, snapshot: patch.data ?? null };
  },
  /**
   * On completion (the not-locked → "Cleared" "sign" transition), promote the
   * case's people into Contacts — the acting individual (with residential
   * address) plus each beneficial owner — so the Fact Find, Needs Analysis and
   * Credit Authorisation forms can prefill from them. Re-reads the freshly saved
   * row inside the sync; best-effort, so it can't fail the completing save.
   */
  onAfterCommit: async ({ id, decision }) => {
    if (decision.kind !== "sign") return;
    await syncAmlCaseContacts(id);
  },
});

/** DELETE — remove a CDD case (blocked once Cleared/locked). */
export const DELETE = makeDeleteHandler(BASE);
