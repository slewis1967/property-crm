import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { errMessage } from "../../../../../utils/errors";
import { checkConfirmsCurrent, checkPartnerContact } from "../../../../../utils/channel-partners-server";
import { coercePartnerBody, type ChannelPartner } from "../../../../../utils/channel-partners";
import type { ContactCheck } from "../../../../../utils/channel-partner-contacts";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

/** Fields a contact check may propose. Everything else is edited in the normal form. */
const APPLYABLE = ["email", "phone", "contact_name", "contact_role", "website"] as const;

/**
 * POST /api/channel-partners/[id]/verify
 *
 *   { action: "check" }   — run the website + web-lookup check, store it, return
 *                           the proposals. Changes no contact field. If every
 *                           detail we hold is published unchanged on their own
 *                           site, that IS verification and is stamped as such.
 *   { action: "apply", fields: { email?, phone?, … } }
 *                         — the operator accepted some proposals: write them and
 *                           stamp verified (method "website").
 *   { action: "manual", note }
 *                         — confirmed some other way (phoned them, they emailed
 *                           back). Stamps verified (method "manual: <note>").
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const b = (await req.json()) as { action?: string; fields?: Record<string, unknown>; note?: unknown };
    const { data: row, error: readErr } = await supabase.from("channel_partners").select("*").eq("id", id).single();
    if (readErr) throw readErr;
    const partner = row as ChannelPartner;
    const now = new Date().toISOString();

    let update: Record<string, unknown>;
    if (b.action === "check") {
      const check = await checkPartnerContact(partner);
      update = { contact_check: check, contact_checked_at: check.checked_at };
      if (checkConfirmsCurrent(partner, check)) {
        update.contact_verified_at = check.checked_at;
        update.contact_verified_by = auth;
        update.contact_verified_method = "website";
      }
    } else if (b.action === "apply") {
      const picked: Record<string, unknown> = {};
      for (const k of APPLYABLE) if (b.fields && k in b.fields) picked[k] = b.fields[k];
      update = coercePartnerBody(picked, false);
      update.contact_verified_at = now;
      update.contact_verified_by = auth;
      update.contact_verified_method = "website";
      // The check has been dealt with — keep its evidence, drop the flag.
      const check = (row as { contact_check?: ContactCheck | null }).contact_check;
      if (check) update.contact_check = { ...check, needs_review: false };
    } else if (b.action === "manual") {
      const note = typeof b.note === "string" ? b.note.trim().slice(0, 200) : "";
      if (!note) {
        return NextResponse.json({ ok: false, error: "Say how you confirmed it (e.g. 'Phoned Tim, 12 Sep')" }, { status: 400 });
      }
      update = { contact_verified_at: now, contact_verified_by: auth, contact_verified_method: `manual: ${note}` };
      const check = (row as { contact_check?: ContactCheck | null }).contact_check;
      if (check) update.contact_check = { ...check, needs_review: false };
    } else {
      return NextResponse.json({ ok: false, error: "action must be check | apply | manual" }, { status: 400 });
    }

    update.updated_at = now;
    const { data, error } = await supabase.from("channel_partners").update(update).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, partner: data });
  } catch (e) {
    log.error("channel_partners.verify_failed", { id, ...errInfo(e) });
    return NextResponse.json({ ok: false, error: errMessage(e, "Contact check failed") }, { status: 500 });
  }
}
