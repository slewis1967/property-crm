import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { TRADING_NAMES, coerceLines, computeTotals, invoiceErrMessage, isIsoDate } from "../../../../utils/invoices";
import { loadInvoice, logInvoiceEvent } from "../../../../utils/invoices-store";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const uuid = (v: unknown): string | null => (typeof v === "string" && UUID_RE.test(v) ? v : null);
const has = (b: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(b, k);

type Ctx = { params: Promise<{ id: string }> };

/** GET: one invoice with its payments and history. */
export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const invoice = await loadInvoice(id);
    if (!invoice) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const [payments, events] = await Promise.all([
      supabase.from("invoice_payments").select("*").eq("invoice_id", id).order("paid_on", { ascending: false }),
      supabase.from("invoice_events").select("*").eq("invoice_id", id).order("created_at", { ascending: false }).limit(100),
    ]);
    if (payments.error) throw payments.error;
    if (events.error) throw events.error;
    return NextResponse.json({ ok: true, invoice, payments: payments.data ?? [], events: events.data ?? [] });
  } catch (e) {
    log.error("invoices.get_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not load the invoice") }, { status: 500 });
  }
}

/**
 * PATCH: a draft takes any field. Once issued, only what doesn't change the tax
 * document can move: the due date, the internal note and the CRM links. The
 * database trigger enforces the same split, so this isn't the only control.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const invoice = await loadInvoice(id);
    if (!invoice) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const b = (await req.json()) as Record<string, unknown>;
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (has(b, "internal_note")) row.internal_note = text(b.internal_note);
    if (has(b, "contact_id")) row.contact_id = uuid(b.contact_id);
    if (has(b, "revenue_deal_id")) row.revenue_deal_id = uuid(b.revenue_deal_id);
    if (has(b, "buyer_email")) row.buyer_email = text(b.buyer_email);
    if (has(b, "due_date")) {
      if (b.due_date !== null && !isIsoDate(b.due_date)) {
        return NextResponse.json({ ok: false, error: "That due date isn't valid" }, { status: 400 });
      }
      row.due_date = b.due_date;
    }

    if (invoice.status === "draft") {
      for (const key of ["buyer_name", "buyer_abn", "buyer_address", "reference", "notes"]) {
        if (has(b, key)) row[key] = text(b[key]);
      }
      if (has(b, "trading_as")) {
        const name = text(b.trading_as);
        row.trading_as = name && (TRADING_NAMES as readonly string[]).includes(name) ? name : null;
      }
      if (has(b, "issue_date")) {
        if (b.issue_date !== null && !isIsoDate(b.issue_date)) {
          return NextResponse.json({ ok: false, error: "That invoice date isn't valid" }, { status: 400 });
        }
        row.issue_date = b.issue_date;
      }
      if (has(b, "amounts_include_gst")) row.amounts_include_gst = b.amounts_include_gst !== false;
      if (has(b, "lines") || has(b, "amounts_include_gst")) {
        const lines = has(b, "lines") ? coerceLines(b.lines) : invoice.lines;
        const includes = has(b, "amounts_include_gst") ? b.amounts_include_gst !== false : invoice.amounts_include_gst;
        row.lines = lines;
        Object.assign(row, computeTotals(lines, includes));
      }
    } else {
      const locked = ["buyer_name", "buyer_abn", "buyer_address", "reference", "notes", "trading_as", "issue_date", "lines", "amounts_include_gst"];
      if (locked.some((key) => has(b, key))) {
        return NextResponse.json(
          { ok: false, error: "This invoice has been issued, so it's locked. Void it and issue a new one." },
          { status: 409 },
        );
      }
    }

    const { error } = await supabase.from("invoices").update(row).eq("id", id);
    if (error) throw error;
    if (invoice.status !== "draft" && has(b, "due_date")) {
      await logInvoiceEvent(id, "due_date_changed", auth, { from: invoice.due_date, to: b.due_date });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("invoices.patch_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Save failed") }, { status: 500 });
  }
}

/** DELETE: drafts only. Issued invoices are records, so they get voided. */
export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const invoice = await loadInvoice(id);
    if (!invoice) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (invoice.status !== "draft") {
      return NextResponse.json({ ok: false, error: "Only drafts can be deleted. Void an issued invoice instead." }, { status: 409 });
    }
    const { error } = await supabase.from("invoices").delete().eq("id", id).eq("status", "draft");
    if (error) throw error;
    await logInvoiceEvent(id, "draft_deleted", auth);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("invoices.delete_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Delete failed") }, { status: 500 });
  }
}
