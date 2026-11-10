/**
 * GET  /api/mail/drafts                                list current user's drafts (newest first)
 * POST /api/mail/drafts { to?, cc?, bcc?, subject?, body_html?, reply_to_email_id?, thread_id? }
 *                                                       create a new empty/seeded draft
 *
 * Draft IDs are returned immediately so the compose page can switch from
 * "new draft" to "editing draft <id>" on the first user keystroke and
 * subsequent auto-saves PATCH the same row.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../utils/cf-access";
import { isMailIdentityKey, DEFAULT_IDENTITY_KEY } from "../../../../utils/mailIdentities";

export const dynamic = "force-dynamic";

/** True when the error is a missing-column error (from_identity not migrated
 * yet) rather than a genuine failure — lets us retry the write without it. */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return (error.message ?? "").toLowerCase().includes("from_identity");
}

export async function GET(req: Request) {
  const owner = await userEmailFromRequest(req);
  const { data, error } = await supabase
    .from("email_drafts")
    .select("id,subject,to_addresses,updated_at,reply_to_email_id,thread_id")
    .eq("owner_user_email", owner)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, drafts: data ?? [] });
}

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

export async function POST(req: Request) {
  const owner = await userEmailFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const fromIdentity = isMailIdentityKey(body.from_identity)
    ? body.from_identity
    : DEFAULT_IDENTITY_KEY;

  const row = {
    owner_user_email: owner,
    to_addresses: asArray(body.to ?? body.to_addresses),
    cc_addresses: asArray(body.cc ?? body.cc_addresses),
    bcc_addresses: asArray(body.bcc ?? body.bcc_addresses),
    subject: typeof body.subject === "string" ? body.subject : null,
    body_html: typeof body.body_html === "string" ? body.body_html : null,
    reply_to_email_id: body.reply_to_email_id ?? null,
    thread_id: body.thread_id ?? null,
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    from_identity: fromIdentity,
  };

  let { data, error } = await supabase.from("email_drafts").insert(row).select("*").single();
  // Graceful degradation: if the from_identity column hasn't been migrated
  // yet, retry the insert without it (draft still saves; identity defaults to
  // nextkey on read).
  if (error && isMissingColumn(error)) {
    const { from_identity: _drop, ...rest } = row;
    void _drop;
    ({ data, error } = await supabase.from("email_drafts").insert(rest).select("*").single());
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, draft: data });
}
