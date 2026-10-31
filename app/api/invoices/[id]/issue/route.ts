import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { brisbaneToday } from "../../../../../utils/paid-services";
import { computeTotals, invoiceErrMessage, issueProblems } from "../../../../../utils/invoices";
import { loadInvoice, loadSettings } from "../../../../../utils/invoices-store";

export const dynamic = "force-dynamic";

/** POST: check the draft is a valid tax invoice, give it its number and lock it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const [invoice, settings] = await Promise.all([loadInvoice(id), loadSettings()]);
    if (!invoice) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (invoice.status !== "draft") {
      return NextResponse.json({ ok: false, error: "This invoice has already been issued." }, { status: 409 });
    }
    const today = brisbaneToday();
    const problems = issueProblems({ ...invoice, issue_date: invoice.issue_date ?? today }, settings);
    if (problems.length > 0) {
      return NextResponse.json({ ok: false, error: problems[0], problems }, { status: 422 });
    }

    // Totals are recomputed from the lines just checked. The function refuses if
    // the draft has changed since, so what gets locked is what was checked.
    const totals = computeTotals(invoice.lines, invoice.amounts_include_gst);
    const { data: number, error } = await supabase.rpc("issue_invoice", {
      p_id: id,
      p_actor: auth,
      p_today: today,
      p_expected_updated_at: invoice.updated_at,
      p_subtotal_cents: totals.subtotal_cents,
      p_gst_cents: totals.gst_cents,
      p_total_cents: totals.total_cents,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, number });
  } catch (e) {
    log.error("invoices.issue_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not issue the invoice") }, { status: 500 });
  }
}
