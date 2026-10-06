/**
 * POST /api/preliminary-assessments/<id>/match   (AUTHED — CF Access)
 *   body { contact_id: string | null }
 *
 * A rep ties a Preliminary Assessment to a contact by hand, or clears a match.
 * This is the path for every PA the email match could not place — an applicant
 * who applied under a different address from the one on their contact record.
 *
 * matched_by is set to the rep's email in BOTH directions. On a clear that is
 * what stops the automatic matcher (utils/pa-match.ts) putting the same contact
 * straight back on the next page load: it only touches rows nobody has decided.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log } from "../../../../../utils/logger";
import { errMessage } from "../../../../../utils/errors";
import {
  PA_LIST_COLUMNS,
  PRELIMINARY_ASSESSMENTS_TABLE,
  toPaListRow,
} from "../../../../../utils/preliminary-assessments";
import { PA_MIGRATION_HINT, isUuid, paTableMissing } from "../../../../../utils/pa-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { contact_id?: unknown } | null;
  if (!body || !("contact_id" in body)) {
    return NextResponse.json({ ok: false, error: "contact_id is required (a contact id, or null to clear)" }, { status: 400 });
  }
  const contactId = body.contact_id;
  if (contactId !== null && !isUuid(contactId)) {
    return NextResponse.json({ ok: false, error: "contact_id must be a contact id or null" }, { status: 400 });
  }

  try {
    if (contactId) {
      // The FK would reject a bad id too, but as a 500 with a constraint name.
      const { data: contact, error: cErr } = await supabase
        .from("contacts")
        .select("id")
        .eq("id", contactId)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!contact) return NextResponse.json({ ok: false, error: "That contact no longer exists" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from(PRELIMINARY_ASSESSMENTS_TABLE)
      .update({ contact_id: contactId, matched_by: auth, matched_at: now, updated_at: now })
      .eq("id", id)
      .select(PA_LIST_COLUMNS)
      .maybeSingle();
    if (error) {
      if (paTableMissing(error)) return NextResponse.json({ ok: false, error: PA_MIGRATION_HINT }, { status: 503 });
      throw error;
    }
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, assessment: toPaListRow(data as unknown as Record<string, unknown>) });
  } catch (e) {
    log.error("pa.manual_match_failed", { pa: id, message: errMessage(e) });
    return NextResponse.json({ ok: false, error: errMessage(e, "Could not update the match") }, { status: 500 });
  }
}
