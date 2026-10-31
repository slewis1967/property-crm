import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { brisbaneToday } from "../../../../../utils/paid-services";
import { invoiceErrMessage, isIsoDate, parseMoneyToCents } from "../../../../../utils/invoices";
import { loadInvoice } from "../../../../../utils/invoices-store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

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
    const { error } = await supabase.rpc("record_invoice_payment", {
      p_id: id,
      p_cents: cents,
      p_paid_on: isIsoDate(b.paid_on) ? b.paid_on : brisbaneToday(),
      p_method: text(b.method),
      p_note: text(b.note),
      p_actor: auth,
    });
    if (error) throw error;
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
    const { data: removed, error } = await supabase.rpc("remove_invoice_payment", {
      p_id: id,
      p_payment_id: paymentId,
      p_actor: auth,
    });
    if (error) throw error;
    if (!removed) return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("invoices.payment_remove_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not remove the payment") }, { status: 500 });
  }
}
