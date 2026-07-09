import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import {
  applicantSummary,
  factFindErrMessage,
  factFindsTableMissing,
  hydrateFactFind,
  FACT_FIND_STATUSES,
} from "../../../../utils/factfind";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Fact Find storage isn't set up yet — run migrations/20260709_borrower_fact_finds.sql in the Supabase SQL editor.";

/** GET — one fact find, including the full `data` blob. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { data, error } = await supabase.from("borrower_fact_finds").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (factFindsTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, factFind: { ...data, data: hydrateFactFind(data.data) } });
  } catch (e) {
    log.error("fact_finds.get_failed", { detail: factFindErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: factFindErrMessage(e, "Load failed") }, { status: 500 });
  }
}

/**
 * PATCH — save the form. Sends the whole `data` blob (the form is a single
 * document, and partial-merging jsonb server-side would fight the client's
 * local edit state). Denormalised columns are re-derived from it here so they
 * can never drift from the blob they summarise.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const b = (await req.json()) as { data?: unknown; status?: string; contactId?: string | null };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (b.data !== undefined) {
      const data = hydrateFactFind(b.data);
      patch.data = data;
      patch.applicant_name = applicantSummary(data) || null;
      patch.loan_amount = data.loan.amount_required;
      patch.referred_by = data.referred_by || null;
    }
    if (typeof b.status === "string" && (FACT_FIND_STATUSES as readonly string[]).includes(b.status)) {
      patch.status = b.status;
    }
    if (b.contactId !== undefined) patch.contact_id = b.contactId || null;

    const { error } = await supabase.from("borrower_fact_finds").update(patch).eq("id", id);
    if (error) {
      if (factFindsTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("fact_finds.update_failed", { detail: factFindErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: factFindErrMessage(e, "Save failed") }, { status: 500 });
  }
}

/** DELETE — remove a fact find. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { error } = await supabase.from("borrower_fact_finds").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("fact_finds.delete_failed", { detail: factFindErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: factFindErrMessage(e, "Delete failed") }, { status: 500 });
  }
}
