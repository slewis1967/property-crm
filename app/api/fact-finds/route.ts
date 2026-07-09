import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { log, errInfo } from "../../../utils/logger";
import {
  applicantSummary,
  emptyFactFind,
  factFindErrMessage,
  factFindsTableMissing,
  hydrateFactFind,
  FACT_FIND_STATUSES,
} from "../../../utils/factfind";

export const dynamic = "force-dynamic";

export const MIGRATION_HINT =
  "Fact Find storage isn't set up yet — run migrations/20260709_borrower_fact_finds.sql in the Supabase SQL editor.";

/** Columns for the list view. Never `select("*")` here — `data` holds borrower PII. */
const LIST_COLUMNS =
  "id,applicant_name,status,contact_id,loan_amount,referred_by,created_by,created_at,updated_at";

/** GET — list fact finds (newest first). Omits the `data` blob. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { data, error } = await supabase
      .from("borrower_fact_finds")
      .select(LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      if (factFindsTableMissing(error)) return NextResponse.json({ ok: true, factFinds: [] });
      throw error;
    }
    return NextResponse.json({ ok: true, factFinds: data ?? [] });
  } catch (e) {
    log.error("fact_finds.list_failed", { detail: factFindErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: factFindErrMessage(e, "List failed") }, { status: 500 });
  }
}

/**
 * POST — create a fact find. Body is optional: with no body you get a blank
 * form to open and fill in. `contact_id` prefills from a contact.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);

    const data = b.data ? hydrateFactFind(b.data) : emptyFactFind();
    const status =
      typeof b.status === "string" && (FACT_FIND_STATUSES as readonly string[]).includes(b.status)
        ? b.status
        : "Draft";

    const row = {
      applicant_name: applicantSummary(data) || null,
      status,
      contact_id: str(b.contactId),
      deal_id: str(b.dealId),
      loan_amount: data.loan.amount_required,
      referred_by: data.referred_by || null,
      data,
      created_by: auth,
    };

    const { data: inserted, error } = await supabase.from("borrower_fact_finds").insert(row).select("id").single();
    if (error) {
      if (factFindsTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e) {
    log.error("fact_finds.create_failed", { detail: factFindErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: factFindErrMessage(e, "Create failed") }, { status: 500 });
  }
}
