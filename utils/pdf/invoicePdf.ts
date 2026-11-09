/**
 * Standalone HTML for a tax invoice, rendered to PDF by utils/pdf/render.ts.
 * Pure and self-styled: the headless browser loads nothing else.
 *
 * Springboard invoices use Springboard colours and show only that registered
 * business name plus the ABN. The bank account name is the one place the legal
 * entity appears on them, because the customer's bank needs it to pay.
 */

import {
  type Invoice,
  type InvoiceSettings,
  computeTotals,
  escapeHtml as e,
  formatCents,
  formatInvoiceDate,
  lineAmountCents,
  sellerDisplayName,
  balanceCents,
} from "../invoices";

function brandColour(tradingAs: string | null): string {
  return tradingAs === "Springboard Homes" ? "#020e40" : "#0F4C5C";
}

export function renderInvoiceHtml(inv: Invoice, settings: InvoiceSettings): string {
  const colour = brandColour(inv.trading_as);
  const totals = computeTotals(inv.lines, inv.amounts_include_gst);
  const anyFree = inv.lines.some((l) => l.gst === "free");
  const heading = inv.status === "draft" ? "DRAFT: not a tax invoice" : "Tax invoice";
  const stamp = inv.status === "void" ? "VOID" : inv.status === "draft" ? "DRAFT" : "";

  const rows = inv.lines
    .map(
      (line) => `<tr>
        <td>${e(line.description).replace(/\n/g, "<br>")}${line.gst === "free" ? '<div class="free">GST-free</div>' : ""}</td>
        <td class="num">${e(String(line.quantity))}</td>
        <td class="num">${formatCents(line.unit_cents)}</td>
        <td class="num">${formatCents(lineAmountCents(line))}</td>
      </tr>`,
    )
    .join("");

  const paid = inv.amount_paid_cents > 0;
  const bank =
    settings.bsb && settings.account_number
      ? `<div class="pay"><h3>How to pay</h3>
         ${settings.bank_name ? `<div>${e(settings.bank_name)}</div>` : ""}
         <div>Account name: ${e(settings.account_name)}</div>
         <div>BSB: ${e(settings.bsb)} &nbsp; Account: ${e(settings.account_number)}</div>
         <div>Please quote invoice ${e(String(inv.number ?? ""))}.</div>
         ${settings.email ? `<div>Remittance: ${e(settings.email)}</div>` : ""}</div>`
      : "";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}
    body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1f2933}
    .page{padding:48px 52px;position:relative}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${colour};padding-bottom:18px}
    .seller{font-size:20px;font-weight:700;color:${colour}}.muted{color:#52606d;line-height:1.5}
    h1{font-size:22px;margin:0 0 6px;color:${colour};text-align:right}.meta{text-align:right;line-height:1.6}
    .to{margin:22px 0}h3{margin:0 0 4px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#52606d}
    table{width:100%;border-collapse:collapse;margin-top:8px}th{background:${colour};color:#fff;text-align:left;padding:8px;font-size:11px}
    td{padding:9px 8px;border-bottom:1px solid #e4e7eb;vertical-align:top}.num{text-align:right;white-space:nowrap}.free{color:#52606d;font-size:10px;margin-top:2px}
    .totals{margin:14px 0 0 auto;width:270px}.totals div{display:flex;justify-content:space-between;padding:4px 8px}
    .grand{font-weight:700;font-size:15px;border-top:2px solid ${colour};margin-top:4px;padding-top:8px!important;color:${colour}}
    .notes{margin-top:20px;white-space:pre-wrap}.pay{margin-top:24px;padding:12px 14px;background:#f5f7fa;line-height:1.6}
    .stamp{position:absolute;top:300px;left:0;right:0;text-align:center;font-size:110px;font-weight:700;color:rgba(186,37,37,.14);transform:rotate(-18deg)}
    .void{margin-top:14px;color:#ba2525;font-weight:700}
  </style></head><body><div class="page">
    ${stamp ? `<div class="stamp">${stamp}</div>` : ""}
    <div class="head">
      <div><div class="seller">${e(sellerDisplayName(inv, settings))}</div>
        <div class="muted">ABN ${e(settings.abn)}${settings.address ? `<br>${e(settings.address)}` : ""}${settings.email ? `<br>${e(settings.email)}` : ""}${settings.phone ? `<br>${e(settings.phone)}` : ""}</div></div>
      <div><h1>${heading}</h1><div class="meta">
        ${inv.number ? `Invoice no: <b>${inv.number}</b><br>` : ""}
        Date: ${e(formatInvoiceDate(inv.issue_date)) || "not issued"}<br>
        Due: ${e(formatInvoiceDate(inv.due_date))}
        ${inv.reference ? `<br>Reference: ${e(inv.reference)}` : ""}</div></div>
    </div>
    <div class="to"><h3>Bill to</h3><div class="muted">
      <b>${e(inv.buyer_name)}</b>${inv.buyer_abn ? `<br>ABN ${e(inv.buyer_abn)}` : ""}${inv.buyer_address ? `<br>${e(inv.buyer_address).replace(/\n/g, "<br>")}` : ""}
    </div></div>
    <table><thead><tr><th>Description</th><th class="num">Qty</th>
      <th class="num">Unit price (${inv.amounts_include_gst ? "inc" : "ex"} GST)</th>
      <th class="num">Amount (${inv.amounts_include_gst ? "inc" : "ex"} GST)</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
      <div><span>Subtotal (ex GST)</span><span>${formatCents(totals.subtotal_cents)}</span></div>
      <div><span>GST</span><span>${formatCents(totals.gst_cents)}</span></div>
      <div class="grand"><span>Total (inc GST)</span><span>${formatCents(totals.total_cents)}</span></div>
      ${paid ? `<div><span>Paid</span><span>${formatCents(inv.amount_paid_cents)}</span></div><div><b>Balance due</b><b>${formatCents(balanceCents(inv))}</b></div>` : ""}
    </div>
    ${anyFree ? '<div class="muted">Items marked GST-free carry no GST.</div>' : ""}
    ${inv.status === "void" ? `<div class="void">This invoice was voided${inv.void_reason ? `: ${e(inv.void_reason)}` : ""}.</div>` : ""}
    ${inv.notes ? `<div class="notes">${e(inv.notes)}</div>` : ""}
    ${inv.status === "void" ? "" : bank}
  </div></body></html>`;
}
