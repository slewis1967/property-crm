import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { sendBrevoEmail } from "../../../../../utils/brevo";
import { htmlToPdf } from "../../../../../utils/pdf/render";
import { renderInvoiceHtml } from "../../../../../utils/pdf/invoicePdf";
import { resolveIdentity } from "../../../../../utils/mailIdentities";
import { brisbaneToday } from "../../../../../utils/paid-services";
import { balanceCents, invoiceEmail, invoiceErrMessage, sellerFor, splitEmails } from "../../../../../utils/invoices";
import { loadInvoice, loadSettings, logInvoiceEvent } from "../../../../../utils/invoices-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { kind: "invoice" | "reminder" }: email the invoice PDF to the buyer.
 *
 * Only ever runs from a person pressing the button; nothing sends these on a
 * schedule. They're transactional, so a marketing unsubscribe doesn't block them.
 * The sent date is stamped only after Brevo accepts the email, so a failed send
 * can't look like one that went out.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as { kind?: unknown };
    const kind = body.kind === "reminder" ? "reminder" : "invoice";

    const [invoice, settings] = await Promise.all([loadInvoice(id), loadSettings()]);
    if (!invoice) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (invoice.status === "draft") {
      return NextResponse.json({ ok: false, error: "Issue the invoice before emailing it." }, { status: 409 });
    }
    if (invoice.status === "void") {
      return NextResponse.json({ ok: false, error: "This invoice has been voided." }, { status: 409 });
    }
    if (kind === "reminder" && balanceCents(invoice) <= 0) {
      return NextResponse.json({ ok: false, error: "Nothing is owing on this invoice." }, { status: 409 });
    }
    const [to] = splitEmails(invoice.buyer_email);
    if (!to) {
      return NextResponse.json({ ok: false, error: "Add the buyer's email address first." }, { status: 422 });
    }

    const seller = sellerFor(invoice, settings);
    const pdf = await htmlToPdf(renderInvoiceHtml(invoice, seller));
    const message = invoiceEmail(invoice, seller, kind, brisbaneToday());
    const identity = resolveIdentity(invoice.trading_as === "Springboard Homes" ? "springboard" : "nextkey");
    const cc = splitEmails(settings.cc_emails)
      .filter((email) => email.toLowerCase() !== to.toLowerCase())
      .map((email) => ({ email }));

    const result = await sendBrevoEmail({
      to: [{ email: to, name: invoice.buyer_name ?? undefined }],
      cc,
      subject: message.subject,
      html: message.html,
      fromEmail: identity.fromEmail,
      fromName: identity.fromName,
      replyTo: seller.email ?? undefined,
      tags: ["invoice", kind],
      attachments: [{ name: `Invoice_${invoice.number}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    });
    if (!result.ok) {
      log.error("invoices.send_failed", { id, error: result.error });
      return NextResponse.json({ ok: false, error: "The email could not be sent. Please try again." }, { status: 502 });
    }

    const now = new Date().toISOString();
    const stamp =
      kind === "reminder"
        ? { last_reminder_at: now, reminder_count: invoice.reminder_count + 1, updated_at: now }
        : { sent_at: now, updated_at: now };
    const { error } = await supabase.from("invoices").update(stamp).eq("id", id);
    if (error) log.error("invoices.send_stamp_failed", { id, ...errInfo(error) });
    await logInvoiceEvent(id, kind === "reminder" ? "reminder_sent" : "emailed", auth, { to, cc: cc.map((c) => c.email) });
    return NextResponse.json({ ok: true, to });
  } catch (e) {
    log.error("invoices.send_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not send the invoice") }, { status: 500 });
  }
}
