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
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (b.data !== undefined) {
      const data = hydrateCreditAuthorisation(b.data);
      patch.data = data;
      patch.names = creditAuthorisationSummary(data) || null;
      patch.status = data.status;
    }
    if (b.contactId !== undefined) patch.contact_id = b.contactId || null;

    const { error } = await supabase.from("credit_authorisations").update(patch).eq("id", id);
    if (error) {
      if (creditAuthorisationsTableMissing(error))
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
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
    const { error } = await supabase.from("credit_authorisations").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("credit_authorisations.delete_failed", { detail: creditAuthErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: creditAuthErrMessage(e, "Delete failed") }, { status: 500 });
  }
}
