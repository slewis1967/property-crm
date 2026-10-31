import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { htmlToPdf } from "../../../../../utils/pdf/render";
import { renderInvoiceHtml } from "../../../../../utils/pdf/invoicePdf";
import { invoiceErrMessage, sellerFor } from "../../../../../utils/invoices";
import { loadInvoice, loadSettings } from "../../../../../utils/invoices-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET: the invoice as a PDF. Drafts come out marked as not a tax invoice. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const [invoice, settings] = await Promise.all([loadInvoice(id), loadSettings()]);
    if (!invoice) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const body = new Uint8Array(await htmlToPdf(renderInvoiceHtml(invoice, sellerFor(invoice, settings))));
    const filename = invoice.number ? `Invoice_${invoice.number}.pdf` : "Invoice_draft.pdf";
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    log.error("invoices.pdf_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "PDF generation failed") }, { status: 500 });
  }
}
