/**
 * GET /api/preliminary-assessments[?contact_id=<uuid>]   (AUTHED — CF Access)
 *
 * The Preliminary Assessments YLA has sent back, newest first: all of them for
 * the staff list, or one contact's for the contact page and the call screen.
 *
 * → { ok: true, assessments: PaListRow[], contacts: { [id]: name } }
 *
 * `assessments` is the contract the call screen reads too — keep it a plain
 * PaListRow[]. `contacts` only names the matched contacts so the list can link
 * them without a second round-trip.
 *
 * The storage path never leaves the server: toPaListRow drops it, and the PDF is
 * reached through ./[id]/pdf.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { log } from "../../../utils/logger";
import { errMessage } from "../../../utils/errors";
import {
  PA_LIST_COLUMNS,
  PRELIMINARY_ASSESSMENTS_TABLE,
  toPaListRow,
} from "../../../utils/preliminary-assessments";
import { PA_MIGRATION_HINT, isUuid, matchPendingPas, paTableMissing } from "../../../utils/pa-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function contactNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from("contacts").select("id,name,full_name,email").in("id", ids);
  if (error) {
    // The list is still useful with "View contact" in place of a name.
    log.warn("pa.contact_names_failed", { message: errMessage(error) });
    return {};
  }
  const out: Record<string, string> = {};
  for (const c of (data ?? []) as { id: string; name?: string | null; full_name?: string | null; email?: string | null }[]) {
    out[c.id] = (c.full_name || c.name || c.email || "").trim();
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const contactId = new URL(req.url).searchParams.get("contact_id");
  if (contactId !== null && !isUuid(contactId)) {
    return NextResponse.json({ ok: false, error: "contact_id must be a uuid" }, { status: 400 });
  }

  // Best effort: a PA the feeder filed a minute ago should be matched by the
  // time a rep looks, without waiting for the next cron sweep. A failure here
  // must not hide the list — the rep can still match by hand.
  try {
    await matchPendingPas();
  } catch (e) {
    log.warn("pa.match_on_list_failed", { message: errMessage(e) });
  }

  try {
    let query = supabase
      .from(PRELIMINARY_ASSESSMENTS_TABLE)
      .select(PA_LIST_COLUMNS)
      .order("received_at", { ascending: false })
      .limit(500);
    if (contactId) query = query.eq("contact_id", contactId);

    const { data, error } = await query;
    if (error) {
      if (paTableMissing(error)) {
        return NextResponse.json({ ok: true, assessments: [], contacts: {}, migration_hint: PA_MIGRATION_HINT });
      }
      throw error;
    }

    const assessments = ((data ?? []) as unknown as Record<string, unknown>[]).map(toPaListRow);
    const ids = [...new Set(assessments.map((a) => a.contact_id).filter((v): v is string => Boolean(v)))];
    return NextResponse.json({ ok: true, assessments, contacts: await contactNames(ids) });
  } catch (e) {
    log.error("pa.list_failed", { message: errMessage(e) });
    return NextResponse.json({ ok: false, error: errMessage(e, "Could not load assessments") }, { status: 500 });
  }
}
