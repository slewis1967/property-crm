import { describe, expect, it } from "vitest";
import {
  type Invoice,
  type InvoiceLine,
  type InvoiceSettings,
  addDays,
  balanceCents,
  coerceLines,
  computeTotals,
  escapeHtml,
  formatCents,
  formatInvoiceDate,
  invoiceEmail,
  invoiceState,
  invoicesTableMissing,
  isIsoDate,
  isValidAbn,
  issueProblems,
  parseMoneyToCents,
  sellerDisplayName,
  splitEmails,
  statusAfterPayments,
  summariseInvoices,
} from "./invoices";
import { renderInvoiceHtml } from "./pdf/invoicePdf";

const line = (unit_cents: number, gst: InvoiceLine["gst"] = "taxable", quantity = 1): InvoiceLine => ({
  description: "Service",
  quantity,
  unit_cents,
  gst,
});

const SETTINGS: InvoiceSettings = {
  seller_name: "NextKey Pty Ltd",
  abn: "28 689 818 264",
  address: "Currumbin Waters QLD",
  email: "accounts@example.com",
  phone: null,
  cc_emails: null,
  bank_name: "Test Bank",
  bsb: "000-000",
  account_name: "NextKey Pty Ltd",
  account_number: "12345678",
  next_number: 1072,
  default_terms_days: 7,
};

const INVOICE: Invoice = {
  id: "i1",
  number: 1072,
  status: "issued",
  source: "crm",
  trading_as: null,
  issue_date: "2026-11-01",
  due_date: "2026-11-08",
  buyer_name: "Sample Buyer Pty Ltd",
  buyer_abn: null,
  buyer_email: "buyer@example.com",
  buyer_address: null,
  reference: null,
  notes: null,
  internal_note: "do not print this",
  lines: [line(1250000)],
  amounts_include_gst: true,
  subtotal_cents: 1136364,
  gst_cents: 113636,
  total_cents: 1250000,
  amount_paid_cents: 0,
  contact_id: null,
  revenue_deal_id: null,
  issued_at: null,
  sent_at: null,
  last_reminder_at: null,
  reminder_count: 0,
  paid_at: null,
  voided_at: null,
  void_reason: null,
  created_at: "2026-11-01T00:00:00Z",
};

describe("money", () => {
  it("parses typed amounts without float error", () => {
    expect(parseMoneyToCents("$12,500.00")).toBe(1250000);
    expect(parseMoneyToCents("19.99")).toBe(1999);
    expect(parseMoneyToCents("1.1")).toBe(110);
    expect(parseMoneyToCents(".5")).toBe(50);
    expect(parseMoneyToCents(1.15)).toBe(115);
    expect(parseMoneyToCents("-50")).toBe(-5000);
  });

  it("rejects things that aren't amounts", () => {
    for (const bad of ["", "abc", "12.3.4", null, undefined, "$"]) {
      expect(parseMoneyToCents(bad)).toBeNull();
    }
  });

  it("formats cents", () => {
    expect(formatCents(1250000)).toBe("$12,500.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-1999)).toBe("-$19.99");
  });
});

describe("GST", () => {
  it("takes 1/11 when prices include GST", () => {
    expect(computeTotals([line(1100)], true)).toEqual({ subtotal_cents: 1000, gst_cents: 100, total_cents: 1100 });
    expect(computeTotals([line(1250000)], true)).toEqual({
      subtotal_cents: 1136364,
      gst_cents: 113636,
      total_cents: 1250000,
    });
  });

  it("adds 10% when prices exclude GST", () => {
    expect(computeTotals([line(1000)], false)).toEqual({ subtotal_cents: 1000, gst_cents: 100, total_cents: 1100 });
  });

  it("charges no GST on GST-free lines, either way", () => {
    expect(computeTotals([line(1000, "free")], true).gst_cents).toBe(0);
    expect(computeTotals([line(1000, "free")], false)).toEqual({ subtotal_cents: 1000, gst_cents: 0, total_cents: 1000 });
  });

  it("handles a mix of taxable and GST-free", () => {
    expect(computeTotals([line(1100), line(500, "free")], true)).toEqual({
      subtotal_cents: 1500,
      gst_cents: 100,
      total_cents: 1600,
    });
  });

  it("works GST out on the total, not line by line", () => {
    // Per line this would be 3 x round(3.3) = 9 cents, not 10.
    const lines = [line(33), line(33), line(33)];
    expect(computeTotals(lines, false).gst_cents).toBe(10);
  });

  it("multiplies quantity and deducts credits", () => {
    expect(computeTotals([line(1000, "taxable", 3)], false).subtotal_cents).toBe(3000);
    expect(computeTotals([line(11000), line(-1100)], true)).toEqual({
      subtotal_cents: 9000,
      gst_cents: 900,
      total_cents: 9900,
    });
  });

  it("is zero with no lines", () => {
    expect(computeTotals([], true)).toEqual({ subtotal_cents: 0, gst_cents: 0, total_cents: 0 });
  });
});

describe("coerceLines", () => {
  it("drops junk and defuses bad numbers", () => {
    expect(coerceLines("nope")).toEqual([]);
    expect(coerceLines([null, 3])).toEqual([]);
    expect(coerceLines([{ description: "A", quantity: "x", unit_cents: "y", gst: "weird" }])).toEqual([
      { description: "A", quantity: 0, unit_cents: 0, gst: "taxable" },
    ]);
    expect(coerceLines([{ description: "B", quantity: "2", unit_cents: 150.4, gst: "free" }])).toEqual([
      { description: "B", quantity: 2, unit_cents: 150, gst: "free" },
    ]);
  });
});

describe("ABN and dates", () => {
  it("validates ABNs with the check digit", () => {
    expect(isValidAbn("28 689 818 264")).toBe(true);
    expect(isValidAbn("28689818265")).toBe(false);
    expect(isValidAbn("123")).toBe(false);
  });

  it("rejects dates that don't exist", () => {
    expect(isIsoDate("2026-11-01")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("01/11/2026")).toBe(false);
  });

  it("adds days across a month and formats without a timezone", () => {
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
    expect(formatInvoiceDate("2026-07-02")).toBe("02/07/2026");
    expect(formatInvoiceDate(null)).toBe("");
  });
});

describe("state", () => {
  const base = { status: "issued" as const, due_date: "2026-11-08", total_cents: 1000, amount_paid_cents: 0 };

  it("isn't overdue on the due date, and is the day after", () => {
    expect(invoiceState(base, "2026-11-08")).toBe("unpaid");
    expect(invoiceState(base, "2026-11-09")).toBe("overdue");
  });

  it("shows part paid, and overdue takes priority", () => {
    const part = { ...base, amount_paid_cents: 400 };
    expect(invoiceState(part, "2026-11-01")).toBe("part_paid");
    expect(invoiceState(part, "2026-11-09")).toBe("overdue");
  });

  it("never calls paid, void or draft overdue", () => {
    for (const status of ["paid", "void", "draft"] as const) {
      expect(invoiceState({ ...base, status }, "2027-01-01")).toBe(status);
    }
  });

  it("flips to paid only when fully received, and overpayment leaves no negative balance", () => {
    expect(statusAfterPayments(1000, 999)).toBe("issued");
    expect(statusAfterPayments(1000, 1000)).toBe("paid");
    expect(balanceCents({ total_cents: 1000, amount_paid_cents: 1200 })).toBe(0);
  });

  it("summarises what's owed, leaving out drafts, paid and void", () => {
    const summary = summariseInvoices(
      [
        { ...base, total_cents: 1000 },
        { ...base, due_date: "2026-12-30", total_cents: 500, amount_paid_cents: 100 },
        { ...base, status: "paid", total_cents: 9999 },
        { ...base, status: "void", total_cents: 9999 },
        { ...base, status: "draft", total_cents: 9999 },
      ],
      "2026-11-20",
    );
    expect(summary).toEqual({ outstandingCents: 1400, overdueCents: 1000, overdueCount: 1, draftCount: 1 });
  });
});

describe("issueProblems", () => {
  const draft = {
    trading_as: null,
    issue_date: "2026-11-01",
    due_date: "2026-11-08",
    buyer_name: "Sample Buyer",
    buyer_abn: null,
    lines: [line(1100)],
    amounts_include_gst: true,
  };

  it("passes a complete invoice", () => {
    expect(issueProblems(draft, SETTINGS)).toEqual([]);
  });

  it("requires the buyer's name or ABN at $1,000 or more", () => {
    const problems = issueProblems({ ...draft, buyer_name: null, lines: [line(100000)] }, SETTINGS);
    expect(problems.join()).toMatch(/\$1,000 or more/);
    expect(issueProblems({ ...draft, buyer_name: null, buyer_abn: "28 689 818 264", lines: [line(100000)] }, SETTINGS)).toEqual([]);
  });

  it("catches missing bank details, a bad ABN and bad lines", () => {
    expect(issueProblems(draft, { ...SETTINGS, bsb: null }).join()).toMatch(/bank details/);
    expect(issueProblems(draft, { ...SETTINGS, abn: "111" }).join()).toMatch(/seller ABN/);
    expect(issueProblems({ ...draft, buyer_abn: "111" }, SETTINGS).join()).toMatch(/buyer's ABN/);
    expect(issueProblems({ ...draft, lines: [] }, SETTINGS).join()).toMatch(/at least one line/);
    expect(issueProblems({ ...draft, lines: [{ ...line(100), description: " " }] }, SETTINGS).join()).toMatch(/description/);
    expect(issueProblems({ ...draft, lines: [line(0)] }, SETTINGS).join()).toMatch(/above zero/);
  });

  it("catches bad dates and an unregistered trading name", () => {
    expect(issueProblems({ ...draft, due_date: null }, SETTINGS).join()).toMatch(/due date/);
    expect(issueProblems({ ...draft, due_date: "2026-10-01" }, SETTINGS).join()).toMatch(/before the invoice date/);
    expect(issueProblems({ ...draft, trading_as: "Made Up" }, SETTINGS).join()).toMatch(/registered/);
  });
});

describe("document and email", () => {
  it("shows everything the ATO requires on a tax invoice", () => {
    const html = renderInvoiceHtml(INVOICE, SETTINGS);
    expect(html).toContain("Tax invoice");
    expect(html).toContain("NextKey Pty Ltd");
    expect(html).toContain("ABN 28 689 818 264");
    expect(html).toContain("01/11/2026");
    expect(html).toContain("Service");
    expect(html).toContain("$11,363.64");
    expect(html).toContain("$1,136.36");
    expect(html).toContain("$12,500.00");
    expect(html).toContain("Sample Buyer Pty Ltd");
  });

  it("never prints the internal note", () => {
    expect(renderInvoiceHtml(INVOICE, SETTINGS)).not.toContain("do not print this");
  });

  it("escapes what people type", () => {
    const html = renderInvoiceHtml({ ...INVOICE, buyer_name: "<script>x</script>" }, SETTINGS);
    expect(html).not.toContain("<script>x");
    expect(escapeHtml(`a&"'`)).toBe("a&amp;&quot;&#39;");
  });

  it("marks drafts as not a tax invoice, and voids as void with no way to pay", () => {
    const draft = renderInvoiceHtml({ ...INVOICE, status: "draft", number: null }, SETTINGS);
    expect(draft).toContain("not a tax invoice");
    const voided = renderInvoiceHtml({ ...INVOICE, status: "void", void_reason: "Wrong buyer" }, SETTINGS);
    expect(voided).toContain("VOID");
    expect(voided).toContain("Wrong buyer");
    expect(voided).not.toContain("How to pay");
  });

  it("keeps the NextKey name out of the Springboard header and sign-off", () => {
    const inv = { ...INVOICE, trading_as: "Springboard Homes" };
    expect(sellerDisplayName(inv, SETTINGS)).toBe("Springboard Homes");
    const html = renderInvoiceHtml(inv, { ...SETTINGS, account_name: "Bank Name Only" });
    expect(html).toContain("Springboard Homes");
    expect(html).not.toContain("NextKey");
    const email = invoiceEmail(inv, { ...SETTINGS, account_name: "Bank Name Only" }, "invoice", "2026-11-01");
    expect(email.subject + email.html).not.toContain("NextKey");
  });

  it("writes the first email and the reminder from the balance", () => {
    const first = invoiceEmail(INVOICE, SETTINGS, "invoice", "2026-11-01");
    expect(first.subject).toBe("Tax invoice 1072 from NextKey Pty Ltd");
    expect(first.html).toContain("$12,500.00");
    const part = { ...INVOICE, amount_paid_cents: 250000 };
    const reminder = invoiceEmail(part, SETTINGS, "reminder", "2026-11-10");
    expect(reminder.subject).toContain("Payment reminder");
    expect(reminder.html).toContain("$10,000.00");
    expect(reminder.html).toContain("2 days ago");
  });

  it("splits copy addresses and drops bad ones", () => {
    expect(splitEmails("a@x.com, b@y.com.au; nope")).toEqual(["a@x.com", "b@y.com.au"]);
    expect(splitEmails(null)).toEqual([]);
  });
});

describe("invoicesTableMissing", () => {
  it("matches table-level codes, not column errors", () => {
    expect(invoicesTableMissing({ code: "42P01" })).toBe(true);
    expect(invoicesTableMissing({ code: "PGRST205" })).toBe(true);
    expect(invoicesTableMissing({ code: "42703" })).toBe(false);
    expect(invoicesTableMissing(null)).toBe(false);
  });
});
