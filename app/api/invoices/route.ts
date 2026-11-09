import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { log, errInfo } from "../../../utils/logger";
import { brisbaneToday } from "../../../utils/paid-services";
import {
  INVOICE_MIGRATION_HINT,
  addDays,
  invoiceErrMessage,
  invoicesTableMissing,
  summariseInvoices,
} from "../../../utils/invoices";
import { asInvoice, loadSettings, logInvoiceEvent } from "../../../utils/invoices-store";

export const dynamic = "force-dynamic";

const LIST_COLUMNS =
  "id,number,status,source,trading_as,issue_date,due_date,buyer_name,buyer_email,reference,subtotal_cents,gst_cents,total_cents,amount_paid_cents,contact_id,revenue_deal_id,sent_at,last_reminder_at,reminder_count,created_at";

/** GET: every invoice, newest first, plus what's owed. A small table, read whole. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { data, error } = await supabase
      .from("invoices")
      .select(LIST_COLUMNS)
      .order("number", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      if (invoicesTableMissing(error)) {
        return NextResponse.json({ ok: true, invoices: [], summary: null, migrationNeeded: true, hint: INVOICE_MIGRATION_HINT });
      }
      throw error;
    }
    const invoices = (data ?? []).map((row) => asInvoice(row as Record<string, unknown>));
    const today = brisbaneToday();
    return NextResponse.json({ ok: true, invoices, today, summary: summariseInvoices(invoices, today), migrationNeeded: false });
  } catch (e) {
    log.error("invoices.list_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not load invoices") }, { status: 500 });
  }
}

/** POST: start a blank draft. Number and final date come when it's issued. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const settings = await loadSettings();
    const today = brisbaneToday();
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        status: "draft",
        issue_date: today,
        due_date: addDays(today, settings.default_terms_days),
        lines: [{ description: "", quantity: 1, unit_cents: 0, gst: "taxable" }],
        created_by: auth,
      })
      .select("id")
      .single();
    if (error) throw error;
    await logInvoiceEvent(data.id, "created", auth);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    if (invoicesTableMissing(e)) {
      return NextResponse.json({ ok: false, error: INVOICE_MIGRATION_HINT }, { status: 501 });
    }
    log.error("invoices.create_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not create the invoice") }, { status: 500 });
  }
}
