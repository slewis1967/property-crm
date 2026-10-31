import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { brisbaneToday } from "../../../../../utils/paid-services";
import { invoiceErrMessage, isIsoDate, parseMoneyToCents, statusAfterPayments } from "../../../../../utils/invoices";
import { loadInvoice, logInvoiceEvent } from "../../../../../utils/invoices-store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Re-add from the payments themselves, so the invoice can't drift from them. */
async function settle(id: string, totalCents: number, lastPaidOn: string | null): Promise<void> {
  const { data, error } = await supabase.from("invoice_payments").select("amount_cents").eq("invoice_id", id);
  if (error) throw error;
  const paid = (data ?? []).reduce((sum, p) => sum + Number(p.amount_cents), 0);
  const status = statusAfterPayments(totalCents, paid);
  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      amount_paid_cents: paid,
      status,
      paid_at: status === "paid" ? lastPaidOn : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) throw updateError;
}

/** POST { amount, paid_on, method?, note? }: record money received. */
export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const invoice = await loadInvoice(id);
    if (!invoice) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (invoice.status === "draft" || invoice.status === "void") {
      return NextResponse.json({ ok: false, error: "Payments can only go against an issued invoice." }, { status: 409 });
    }
    const b = (await req.json()) as Record<string, unknown>;
    const cents = parseMoneyToCents(b.amount);
    if (cents === null || cents <= 0) {
      return NextResponse.json({ ok: false, error: "Enter the amount received." }, { status: 400 });
    }
    const paidOn = isIsoDate(b.paid_on) ? b.paid_on : brisbaneToday();
    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: id,
      amount_cents: cents,
      paid_on: paidOn,
      method: typeof b.method === "string" && b.method.trim() ? b.method.trim() : null,
      note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : null,
      created_by: auth,
    });
    if (error) throw error;
    await settle(id, invoice.total_cents, paidOn);
    await logInvoiceEvent(id, "payment_recorded", auth, { cents, paid_on: paidOn });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("invoices.payment_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not record the payment") }, { status: 500 });
  }
}

/** DELETE ?payment=<id>: undo a payment entered by mistake. The history keeps it. */
export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const paymentId = new URL(req.url).searchParams.get("payment");
  if (!paymentId) return NextResponse.json({ ok: false, error: "Which payment?" }, { status: 400 });
  try {
    const invoice = await loadInvoice(id);
    if (!invoice) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const { data, error } = await supabase
      .from("invoice_payments")
      .delete()
      .eq("id", paymentId)
      .eq("invoice_id", id)
      .select("amount_cents,paid_on");
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    await settle(id, invoice.total_cents, invoice.paid_at);
    await logInvoiceEvent(id, "payment_removed", auth, { cents: data[0].amount_cents, paid_on: data[0].paid_on });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("invoices.payment_remove_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not remove the payment") }, { status: 500 });
  }
}
