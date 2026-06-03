/**
 * GET /api/mail/attachments?draft_id=...   — list attachments on a draft
 * GET /api/mail/attachments?email_id=...   — list attachments on a sent/received email
 *
 * Ownership enforced via the parent table — see [id]/route.ts for the same
 * lookup pattern.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../utils/cf-access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = await userEmailFromRequest(req);
  const url = new URL(req.url);
  const draftId = url.searchParams.get("draft_id");
  const emailId = url.searchParams.get("email_id");

  if (!draftId && !emailId) {
    return NextResponse.json({ ok: false, error: "draft_id or email_id required" }, { status: 400 });
  }

  // Ownership gate — make sure the parent row belongs to the caller before
  // we leak file metadata.
  if (draftId) {
    const { data } = await supabase
      .from("email_drafts")
      .select("owner_user_email")
      .eq("id", draftId)
      .maybeSingle();
    if (!data || data.owner_user_email !== owner) {
      return NextResponse.json({ ok: true, attachments: [] });
    }
  } else if (emailId) {
    const { data } = await supabase
      .from("email_log")
      .select("owner_user_email")
      .eq("id", emailId)
      .maybeSingle();
    if (!data || data.owner_user_email !== owner) {
      return NextResponse.json({ ok: true, attachments: [] });
    }
  }

  let q = supabase
    .from("email_attachments")
    .select("id,filename,mime_type,size_bytes,email_kind,created_at")
    .order("created_at", { ascending: true });
  if (draftId) q = q.eq("email_id", draftId).eq("email_kind", "draft");
  else if (emailId) q = q.eq("email_id", emailId).in("email_kind", ["inbound", "outbound"]);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, attachments: data ?? [] });
}
