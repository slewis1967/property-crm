import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import {
  creditAuthErrMessage,
  creditAuthorisationSummary,
  creditAuthorisationsTableMissing,
  hydrateCreditAuthorisation,
} from "../../../../utils/creditAuthorisation";
import { classifyPatch, isLocked, recordAudit, LOCKED_EDIT_MESSAGE, LOCKED_DELETE_MESSAGE } from "../../../../utils/compliance-audit";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Credit Authorisation storage isn't set up yet — run migrations/20260710_credit_authorisations.sql in the Supabase SQL editor.";

/** Explicit columns — never `select("*")`; `data` holds name + address PII. */
const ROW_COLUMNS = "id,names,status,contact_id,deal_id,data,created_by,created_at,updated_at";

/** GET — one credit authorisation, including the full `data` blob. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { data, error } = await supabase
      .from("credit_authorisations")
      .select(ROW_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (creditAuthorisationsTableMissing(error))
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, creditAuthorisation: { ...data, data: hydrateCreditAuthorisation(data.data) } });
  } catch (e) {
    log.error("credit_authorisations.get_failed", { detail: creditAuthErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: creditAuthErrMessage(e, "Load failed") }, { status: 500 });
  }
}

/**
 * PATCH — save the form. Sends the whole `data` blob (the form is a single
 * document). The denormalised `names`/`status` columns are re-derived from it
 * here so they can never drift from the blob they summarise.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const b = (await req.json()) as { data?: unknown; contactId?: string | null };

    // Fetch the current status first — the sign-lock is derived from it. For this
    // document the status lives inside the `data` blob (data.status), which the
    // top-level `status` column mirrors on every save.
    const { data: current, error: fetchErr } = await supabase
      .from("credit_authorisations")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      if (creditAuthorisationsTableMissing(fetchErr))
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw fetchErr;
    }
    if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const currentStatus = current.status as string;
    const hydrated = b.data !== undefined ? hydrateCreditAuthorisation(b.data) : undefined;
    const incomingStatus = hydrated ? hydrated.status : currentStatus;

    const decision = classifyPatch("credit_authorisation", currentStatus, incomingStatus);
    if (decision.kind === "reject") {
      return NextResponse.json({ ok: false, error: LOCKED_EDIT_MESSAGE }, { status: 409 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth };

    if (hydrated) {
      patch.data = hydrated;
      patch.names = creditAuthorisationSummary(hydrated) || null;
      patch.status = hydrated.status;
    }
    if (b.contactId !== undefined) patch.contact_id = b.contactId || null;

    const { error } = await supabase.from("credit_authorisations").update(patch).eq("id", id);
    if (error) {
      if (creditAuthorisationsTableMissing(error))
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    await recordAudit({
      docType: "credit_authorisation",
      docId: id,
      action: decision.kind,
      changedBy: auth,
      statusAfter: incomingStatus,
      snapshot: hydrated ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("credit_authorisations.update_failed", { detail: creditAuthErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: creditAuthErrMessage(e, "Save failed") }, { status: 500 });
  }
}

/** DELETE — remove a credit authorisation. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    // Fetch the row first: a signed authorisation can't be deleted, and we
    // snapshot its final state into the audit log before removing it.
    const { data: current, error: fetchErr } = await supabase
      .from("credit_authorisations")
      .select("status,data")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      if (creditAuthorisationsTableMissing(fetchErr))
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw fetchErr;
    }
    if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (isLocked("credit_authorisation", current.status as string)) {
      return NextResponse.json({ ok: false, error: LOCKED_DELETE_MESSAGE }, { status: 409 });
    }

    const { error } = await supabase.from("credit_authorisations").delete().eq("id", id);
    if (error) throw error;
    await recordAudit({
      docType: "credit_authorisation",
      docId: id,
      action: "delete",
      changedBy: auth,
      statusAfter: current.status as string,
      snapshot: current.data,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("credit_authorisations.delete_failed", { detail: creditAuthErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: creditAuthErrMessage(e, "Delete failed") }, { status: 500 });
  }
}
