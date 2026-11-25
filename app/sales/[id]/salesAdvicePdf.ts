/**
 * Sales Advice PDF — the one-page summary a developer's sales team issues
 * when a lot is reserved: parties, lot, price, deposit, dates, conditions.
 * Built in the browser with jsPDF and attached to the sale as a file.
 */
import { jsPDF } from "jspdf";
import { formatSaleDate, saleStageLabel, type DepositPosition } from "../../../utils/sales";

type Sale = Record<string, unknown>;

const s = (v: unknown) => (v == null || v === "" ? "—" : String(v));
const money = (v: unknown) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
const date = (v: unknown) => (typeof v === "string" && v ? formatSaleDate(v) : "—");

export function buildSalesAdvicePdf(sale: Sale, deposit: DepositPosition): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 18;
  const right = 192;
  let y = 20;

  doc.setFillColor(15, 76, 92); // NextKey teal
  doc.rect(0, 0, 210, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text("Sales Advice", left, (y += 6));
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);
  doc.text(`Issued ${new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })} by NextKey Property Strategists`, left, (y += 6));
  doc.text(`Status: ${saleStageLabel(String(sale.stage))}`, right, y, { align: "right" });
  y += 4;

  const section = (title: string, rows: [string, string][]) => {
    y += 8;
    doc.setDrawColor(220, 220, 220);
    doc.line(left, y - 4, right, y - 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 76, 92);
    doc.text(title.toUpperCase(), left, y);
    y += 2;
    doc.setFontSize(10);
    for (let i = 0; i < rows.length; i += 2) {
      y += 6;
      for (const [col, [label, value]] of [rows[i], rows[i + 1]].filter(Boolean).entries()) {
        const x = left + col * 88;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text(label, x, y);
        doc.setTextColor(20, 20, 20);
        doc.text(doc.splitTextToSize(value, 50)[0], x + 36, y);
      }
    }
  };

  section("Property", [
    ["Lot", s(sale.sale_ref)],
    ["Unit no.", s(sale.unit_no)],
    ["Project", s(sale.project_name)],
    ["Developer", s(sale.developer_name)],
    ["Colour selection", s(sale.colour_selection)],
    ["Price", money(sale.sale_price ?? sale.price_snapshot)],
  ]);
  section("Purchaser", [
    ["Buyer(s)", s(sale.buyer_names)],
    ["Phone", s(sale.buyer_phone)],
    ["Email", s(sale.buyer_email)],
    ["Address", s(sale.buyer_address)],
    ["Solicitor", s(sale.buyer_solicitor)],
    ["Broker", s(sale.buyer_broker)],
    ["Guarantor", s(sale.guarantor)],
    ["FIRB required", sale.firb_required == null ? "—" : sale.firb_required ? "Yes" : "No"],
  ]);
  section("Deposit", [
    ["Initial deposit", money(deposit.initialRequired || null)],
    ["Due", date(sale.deposit_initial_due_date)],
    ["Balance deposit", money(deposit.balanceRequired || null)],
    ["Due", date(sale.deposit_balance_due_date)],
    ["Received to date", money(deposit.totalReceived)],
    ["Total deposit", money(deposit.totalRequired || null)],
  ]);
  section("Key dates", [
    ["Exchange (anticipated)", date(sale.anticipated_exchange_date)],
    ["Exchanged", date(sale.exchange_date)],
    ["Cooling-off", sale.cooling_off_waived ? "Waived" : date(sale.cooling_off_expires)],
    ["Settlement (anticipated)", date(sale.anticipated_settlement_date)],
  ]);

  y += 10;
  doc.setDrawColor(220, 220, 220);
  doc.line(left, y - 4, right, y - 4);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 76, 92);
  doc.text("TERMS AND CONDITIONS", left, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);
  const terms = doc.splitTextToSize(s(sale.conditions), right - left);
  doc.text(terms, left, (y += 6));
  y += terms.length * 4.5;
  if (sale.clause_amendments) {
    const amend = doc.splitTextToSize(`Clause amendments: ${s(sale.clause_amendments)}`, right - left);
    doc.text(amend, left, (y += 4));
  }

  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "This advice records the agreed terms of reservation. It is not a contract of sale; the contract issued by the developer governs.",
    left,
    285,
  );
  return doc.output("blob");
}
