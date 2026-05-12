/**
 * GET    /api/mail/drafts/{id}        fetch a single draft (compose page hydrates from this)
 * PATCH  /api/mail/drafts/{id}        partial update — used by auto-save (every 5s)
 * DELETE /api/mail/drafts/{id}        discard draft
 *
 * Ownership is enforced — drafts belonging to a different user 404 even
 * though the row exists, so a stray ID in someone's URL doesn't leak content.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../../utils/cf-access";

export const dynamic = "force-dynamic";

function asArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.filter((x) => typeof x === "string");
  if (typeof input === "string") {
    return input
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owner = userEmailFromRequest(req);
  const { data, error } = await supabase
    .from("email_drafts")
    .select("*")
    .eq("id", id)
    .eq("owner_user_email", owner)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });
  return NextResponse.json({ ok: true, draft: data });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owner = userEmailFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.to !== undefined || body.to_addresses !== undefined) {
    patch.to_addresses = asArray(body.to ?? body.to_addresses);
  }
  if (body.cc !== undefined || body.cc_addresses !== undefined) {
    patch.cc_addresses = asArray(body.cc ?? body.cc_addresses);
  }
  if (body.bcc !== undefined || body.bcc_addresses !== undefined) {
    patch.bcc_addresses = asArray(body.bcc ?? body.bcc_addresses);
  }
  if (typeof body.subject === "string") patch.subject = body.subject;
  if (typeof body.body_html === "string") patch.body_html = body.body_html;
  if (Array.isArray(body.attachments)) patch.attachments = body.attachments;

  const { data, error } = await supabase
    .from("email_drafts")
    .update(patch)
    .eq("id", id)
    .eq("owner_user_email", owner)
    .select("id,updated_at")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, draft: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owner = userEmailFromRequest(req);
  const { error } = await supabase
    .from("email_drafts")
    .delete()
    .eq("id", id)
    .eq("owner_user_email", owner);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
