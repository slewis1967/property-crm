import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { invoiceErrMessage } from "../../../../../utils/invoices";
import { loadInvoice } from "../../../../../utils/invoices-store";

export const dynamic = "force-dynamic";

/**
 * POST { reason }: cancel an issued invoice. It stays on file; its number isn't
 * reused. These checks give the usual answers; void_invoice repeats them under
 * the row lock, so a payment arriving at the same moment can't slip past.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const invoice = await loadInvoice(id);
    if (!invoice) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (invoice.status === "draft") {
      return NextResponse.json({ ok: false, error: "Delete a draft instead of voiding it." }, { status: 409 });
    }
    if (invoice.status === "void") {
      return NextResponse.json({ ok: false, error: "Already voided." }, { status: 409 });
    }
    if (invoice.amount_paid_cents > 0) {
      return NextResponse.json({ ok: false, error: "Remove its payments before voiding it." }, { status: 409 });
    }
    const b = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";
    if (!reason) return NextResponse.json({ ok: false, error: "Say why it's being voided." }, { status: 400 });

    const { error } = await supabase.rpc("void_invoice", { p_id: id, p_actor: auth, p_reason: reason });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("invoices.void_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not void the invoice") }, { status: 500 });
  }
}
