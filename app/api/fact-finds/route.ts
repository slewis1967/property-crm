import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { log, errInfo } from "../../../utils/logger";
import {
  applicantSummary,
  emptyFactFind,
  factFindErrMessage,
  factFindFromContact,
  factFindsTableMissing,
  hydrateFactFind,
  FACT_FIND_STATUSES,
  type FactFindContact,
  type FactFindData,
} from "../../../utils/factfind";
import { recordAudit } from "../../../utils/compliance-audit";

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

/** Columns mapped onto the applicant. Explicit select — never `*` (borrower PII). */
const CONTACT_PREFILL_COLUMNS =
  "name,full_name,first_name,email,phone,date_of_birth," +
  "home_address_street,home_address_suburb,home_address_state,home_address_postcode," +
  "occupation,annual_income,hecs_balance";

/**
 * Build a fact find seeded from a contact's applicant fields. Best-effort: an
 * unresolved id or any read error falls back to a blank form, so a create is
 * never failed by prefill.
 */
async function prefillFromContact(contactId: string): Promise<FactFindData> {
  try {
    const { data: contact, error } = await supabase
      .from("contacts")
      .select(CONTACT_PREFILL_COLUMNS)
      .eq("id", contactId)
      .maybeSingle();
    if (error || !contact) return emptyFactFind();
    return factFindFromContact(contact as FactFindContact);
  } catch {
    return emptyFactFind();
  }
}

/**
 * POST — create a fact find. Body is optional: with no body you get a blank
 * form to open and fill in. When `contactId` is provided (and no explicit
 * `data` blob is sent), the first applicant is prefilled from that contact.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);

    const contactId = str(b.contactId);
    // An explicit `data` blob wins; otherwise a contactId prefills; otherwise blank.
    const data = b.data
      ? hydrateFactFind(b.data)
      : contactId
        ? await prefillFromContact(contactId)
        : emptyFactFind();
    const status =
      typeof b.status === "string" && (FACT_FIND_STATUSES as readonly string[]).includes(b.status)
        ? b.status
        : "Draft";

    const row = {
      applicant_name: applicantSummary(data) || null,
      status,
      contact_id: contactId,
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
    await recordAudit({
      docType: "fact_find",
      docId: inserted.id,
      action: "create",
      changedBy: auth,
      statusAfter: status,
      snapshot: data,
    });
    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e) {
    log.error("fact_finds.create_failed", { detail: factFindErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: factFindErrMessage(e, "Create failed") }, { status: 500 });
  }
}
