import {
  applicantSummary,
  factFindErrMessage,
  factFindsTableMissing,
  factFindCompletionBlockers,
  hydrateFactFind,
  FACT_FIND_STATUSES,
  type FactFindData,
} from "../../../../utils/factfind";
import {
  makeGetOneHandler,
  makePatchHandler,
  makeDeleteHandler,
  type PatchBuild,
} from "../../../../utils/compliance-doc-route";
import { syncFactFindContacts } from "../../../../utils/contact-sync";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Fact Find storage isn't set up yet — run migrations/20260709_borrower_fact_finds.sql in the Supabase SQL editor.";

const BASE = {
  table: "borrower_fact_finds",
  docType: "fact_find",
  logPrefix: "fact_finds",
  migrationHint: MIGRATION_HINT,
  errMessage: factFindErrMessage,
  tableMissing: factFindsTableMissing,
} as const;

/** GET — one fact find, including the full `data` blob. */
export const GET = makeGetOneHandler({
  ...BASE,
  oneColumns: "*",
  itemKey: "factFind",
  hydrate: hydrateFactFind,
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
      typeof b.status === "string" && (FACT_FIND_STATUSES as readonly string[]).includes(b.status)
        ? b.status
        : currentStatus;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth };

    if (b.data !== undefined) {
      const data = hydrateFactFind(b.data);
      patch.data = data;
      patch.applicant_name = applicantSummary(data) || null;
      patch.loan_amount = data.loan.amount_required;
      patch.referred_by = data.referred_by || null;
    }
    if (incomingStatus !== currentStatus) patch.status = incomingStatus;
    if (b.contactId !== undefined) patch.contact_id = b.contactId || null;

    return { patch, incomingStatus, snapshot: patch.data ?? null };
  },
  // Refuse to sign off a stub — the exact gap that let a blank fact find reach
  // Complete. Only checked on the sign transition (see the shared handler).
  completionBlockers: (snapshot) =>
    snapshot ? factFindCompletionBlockers(snapshot as FactFindData) : [],
  /**
   * On completion (the not-locked → Complete "sign" transition), promote both
   * applicants into Contacts so the Credit Authorisation, Needs Analysis and
   * AML/CTF forms can prefill from them — Applicant 2 in particular, who is keyed
   * by hand and otherwise never becomes a contact. Re-reads the freshly saved
   * row inside the sync; best-effort, so it can't fail the completing save.
   */
  onAfterCommit: async ({ id, decision }) => {
    if (decision.kind !== "sign") return;
    await syncFactFindContacts(id);
  },
});

/** DELETE — remove a fact find. */
export const DELETE = makeDeleteHandler(BASE);
