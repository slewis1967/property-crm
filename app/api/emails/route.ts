/**
 * GET  /api/emails?contact_id=&opportunity_id=&limit=
 *   List emails filtered by contact or opportunity. Newest first.
 *
 * POST /api/emails
 *   Body: { to, to_name?, subject, body_html, body_text?, cc?, bcc?,
 *           contact_id?, opportunity_id?, tags?, from_identity? }
 *   from_identity: "nextkey" (default) | "springboard" — the business
 *   account it goes out from, see utils/send-accounts.ts.
 *   Sends via Brevo, logs the row, returns the saved row.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { sendBrevoEmail } from "../../../utils/brevo";
import { requireAuth } from "../../../utils/cf-access";
import { DEFAULT_IDENTITY_KEY, isMailIdentityKey, resolveIdentity } from "../../../utils/mailIdentities";
import { sendAccountsFor, type SendAccount } from "../../../utils/send-accounts";
import { sharedMailboxFor } from "../../../utils/shared-mailboxes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const contactId = url.searchParams.get("contact_id");
  const opportunityId = url.searchParams.get("opportunity_id");
  const owner = url.searchParams.get("owner");           // owner_user_email
  const folderId = url.searchParams.get("folder_id");
  const label = url.searchParams.get("label");
  const search = url.searchParams.get("search");          // full-text against body_search
  const view = url.searchParams.get("view");              // inbox|starred|archive|trash|spam|sent|drafts
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);

  let q = supabase
    .from("email_log")
    .select(
      "id,direction,to_email,to_name,from_email,from_name,subject,body_html,status,error,sent_by," +
      "sent_at,created_at,tags,message_id,in_reply_to,thread_id," +
      "owner_user_email,folder_id,labels,is_read,is_starred,is_archived,is_trashed,is_spam,spam_score",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (contactId) q = q.eq("contact_id", contactId);
  if (opportunityId) q = q.eq("opportunity_id", opportunityId);
  if (owner) q = q.eq("owner_user_email", owner);
  if (folderId) q = q.eq("folder_id", folderId);
  if (label) q = q.contains("labels", [label]);

  // The `view` param maps to a predefined filter combo so the inbox sidebar
  // doesn't have to assemble query params client-side. Each view is mutually
  // exclusive against the others (Inbox isn't Trash) — except 'starred',
  // which is orthogonal (a starred mail can also be in any non-trash folder).
  switch (view) {
    case "inbox":
      q = q.eq("is_trashed", false).eq("is_spam", false).eq("is_archived", false).eq("direction", "inbound");
      break;
    case "starred":
      q = q.eq("is_starred", true).eq("is_trashed", false).eq("is_spam", false);
      break;
    case "archive":
      q = q.eq("is_archived", true).eq("is_trashed", false).eq("is_spam", false);
      break;
    case "trash":
      q = q.eq("is_trashed", true);
      break;
    case "spam":
      q = q.eq("is_spam", true).eq("is_trashed", false);
      break;
    case "sent":
      q = q.eq("direction", "outbound").eq("is_trashed", false).eq("is_spam", false);
      break;
  }

  // Full-text search uses the tsvector column populated by the trigger
  // installed in the Phase 1 migration. plainto_tsquery is the right call
  // for user-entered search strings (no operators, just words).
  if (search) {
    q = q.textSearch("body_search", search, { type: "plain", config: "english" });
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, emails: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const {
    to, to_name, subject, body_html, body_text,
    cc, bcc, contact_id, opportunity_id, tags,
    in_reply_to, thread_id,
  } = body;

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ ok: false, error: "Valid 'to' email required" }, { status: 400 });
  }
  if (!subject || typeof subject !== "string") {
    return NextResponse.json({ ok: false, error: "subject required" }, { status: 400 });
  }
  if (!body_html || typeof body_html !== "string") {
    return NextResponse.json({ ok: false, error: "body_html required" }, { status: 400 });
  }

  // Replying from a shared mailbox view (e.g. Springboard): only members may.
  // The mail goes out as that brand, the row is filed under the mailbox so the
  // reply joins the thread for every member, and the sender's personal NextKey
  // signature is skipped so the brand firewall holds.
  const shared = body.mailbox ? sharedMailboxFor(auth, body.mailbox) : null;
  if (body.mailbox && !shared) {
    return NextResponse.json({ ok: false, error: "No access to that mailbox" }, { status: 403 });
  }
  // The verified identity from requireAuth, never a raw request header: mail
  // now goes out FROM this address, so a client-set x-user-email would let
  // anyone signed in send as a colleague.
  const sentBy: string = auth;

  // Which business account it goes out from (the composer's From picker,
  // utils/send-accounts.ts). Not chosen → the user's own NextKey account:
  // their own nextkey.com.au address (Sean, 11 Nov 2026) and their own
  // signature. Ignored when replying from a shared mailbox view.
  let account: SendAccount | null = null;
  if (!shared) {
    const wanted = isMailIdentityKey(body.from_identity) ? body.from_identity : DEFAULT_IDENTITY_KEY;
    account = (await sendAccountsFor(sentBy)).find((a) => a.key === wanted) ?? null;
    if (!account) {
      return NextResponse.json({ ok: false, error: "You can't send from that account" }, { status: 403 });
    }
  }

  // Resolve owner_user_email for the inbox routing: the sender, or the shared
  // mailbox the account belongs to so replies reach every member. Null when
  // the sender isn't a registered alias (system mail → shared/system view).
  const ownerEmail = shared ? shared.address : account!.owner;

  const sender = shared
    ? resolveIdentity(shared.identity)
    : { fromEmail: account!.fromEmail, fromName: account!.fromName };

  // Append the chosen account's signature. Replies from a shared mailbox view
  // skip it (brand firewall), as does system mail with `skip_signature: true`.
  const skipSig = body.skip_signature === true || shared !== null;
  const sig = shared ? null : account!.signature;
  if (!skipSig && !sig) {
    // Standing rule: an outward email carries the sender's signature; none on file → don't send.
    return NextResponse.json(
      { ok: false, error: `No signature on file for ${account!.label}. Set one up before sending from it.` },
      { status: 400 },
    );
  }
  const finalHtml = skipSig || !sig ? body_html : `${body_html}${sig.html}`;
  const finalText = skipSig || !sig
    ? (body_text ?? null)
    : `${body_text ?? ""}${sig.text}`;

  // 1. Insert as queued so we have an audit row even if Brevo errors.
  const { data: row, error: insertErr } = await supabase
    .from("email_log")
    .insert({
      contact_id: contact_id ?? null,
      opportunity_id: opportunity_id ?? null,
      direction: "outbound",
      to_email: to,
      to_name: to_name ?? null,
      from_email: sender.fromEmail,
      from_name: sender.fromName,
      cc: Array.isArray(cc) ? cc : [],
      bcc: Array.isArray(bcc) ? bcc : [],
      subject,
      body_html: finalHtml,
      body_text: finalText,
      status: "queued",
      sent_by: sentBy,
      owner_user_email: ownerEmail,
      // Outbound mail is "read" by definition (the sender saw it before clicking
      // send) and starts unstarred/unarchived. These default in the DB but we
      // set them here too so future readers don't have to chase the default.
      is_read: true,
      tags: Array.isArray(tags) ? tags : [],
      in_reply_to: in_reply_to ?? null,
      thread_id: thread_id ?? null,
    })
    .select("*")
    .single();

  if (insertErr || !row) {
    return NextResponse.json({ ok: false, error: insertErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // 2. Send via Brevo.
  // Set RFC822 In-Reply-To and References when this is a reply, so the
  // recipient's mail client threads it under the original conversation.
  const replyHeaders: Record<string, string> = {};
  if (in_reply_to) {
    replyHeaders["In-Reply-To"] = in_reply_to;
    replyHeaders["References"] = in_reply_to;
  }
  const result = await sendBrevoEmail({
    to: [{ email: to, name: to_name ?? undefined }],
    subject,
    html: finalHtml,
    text: finalText ?? undefined,
    tags: ["crm-outbound", ...(Array.isArray(tags) ? tags : [])],
    headers: replyHeaders,
    fromEmail: sender.fromEmail,
    fromName: sender.fromName,
  });

  // 3. Update row with outcome. Brevo's `messageId` IS the RFC822 Message-ID
  // (e.g. <abc@smtp-relay.brevo.com>), so populate both columns. message_id
  // is what the inbound poller threads against when replies come in.
  const update: Record<string, unknown> = result.ok
    ? {
        status: "sent",
        brevo_message_id: result.messageId,
        message_id: result.messageId,
        sent_at: new Date().toISOString(),
      }
    : { status: "failed", error: result.error };

  const { data: updated, error: updateErr } = await supabase
    .from("email_log")
    .update(update)
    .eq("id", row.id)
    .select("*")
    .single();

  if (updateErr) {
    return NextResponse.json(
      { ok: false, error: `Sent but failed to update audit row: ${updateErr.message}`, email: row },
      { status: 500 },
    );
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, email: updated }, { status: 502 });
  }
  return NextResponse.json({ ok: true, email: updated });
}
