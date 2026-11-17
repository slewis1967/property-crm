import { describe, it, expect } from "vitest";
import {
  addDays,
  brisbaneToday,
  buildStatement,
  EMPTY_PAY_RECORD,
  expectedPayDate,
  introducerPayLine,
  introducerPayTimingEnabled,
  isIsoDate,
  parsePayUpdate,
  partnerPayLine,
  payColumnsMissing,
  payOverdue,
  payRecordFromRow,
  payStatus,
  PARTNER_RESPONSE_STANDARD,
  type PayRecord,
} from "./partner-pay";
import { assertNoForbiddenKeys } from "./partner";

const rec = (p: Partial<PayRecord>): PayRecord => ({ ...EMPTY_PAY_RECORD, ...p });

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2026-11-17")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("17/11/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
  it("adds days across a month end", () => {
    expect(addDays("2026-11-25", 14)).toBe("2026-12-09");
  });
  it("reads today in Brisbane, not UTC", () => {
    // 15:00 UTC on 17 Nov is 01:00 on 18 Nov in Brisbane.
    expect(brisbaneToday(new Date("2026-11-17T15:00:00Z"))).toBe("2026-11-18");
  });
});

describe("expected pay date (clause 5.4: 14 days, against an invoice)", () => {
  it("is unknown until both the fee and the invoice are in", () => {
    expect(expectedPayDate(rec({ fundsReceivedOn: "2026-11-01" }))).toBeNull();
    expect(expectedPayDate(rec({ invoiceReceivedOn: "2026-11-01" }))).toBeNull();
  });
  it("runs 14 days from the invoice when it arrives after the fee", () => {
    expect(expectedPayDate(rec({ fundsReceivedOn: "2026-11-01", invoiceReceivedOn: "2026-11-05" }))).toBe("2026-11-19");
  });
  it("never runs from before the fee arrived, even if the invoice came first", () => {
    expect(expectedPayDate(rec({ fundsReceivedOn: "2026-11-10", invoiceReceivedOn: "2026-11-02" }))).toBe("2026-11-24");
  });
});

describe("pay status", () => {
  it("follows the deal and the recorded events", () => {
    expect(payStatus("open", EMPTY_PAY_RECORD)).toBe("before_settlement");
    expect(payStatus("closed", EMPTY_PAY_RECORD)).toBe("not_payable");
    expect(payStatus("settled", EMPTY_PAY_RECORD)).toBe("awaiting_funds");
    expect(payStatus("settled", rec({ fundsReceivedOn: "2026-11-01" }))).toBe("awaiting_invoice");
    expect(payStatus("settled", rec({ fundsReceivedOn: "2026-11-01", invoiceReceivedOn: "2026-11-02" }))).toBe("invoiced");
    expect(
      payStatus("settled", rec({ fundsReceivedOn: "2026-11-01", invoiceReceivedOn: "2026-11-02", paidOn: "2026-11-10" })),
    ).toBe("paid");
  });
  it("flags overdue for staff only once the expected date has passed", () => {
    const r = rec({ fundsReceivedOn: "2026-11-01", invoiceReceivedOn: "2026-11-02" });
    expect(payOverdue("settled", r, "2026-11-16")).toBe(false);
    expect(payOverdue("settled", r, "2026-11-17")).toBe(true);
    expect(payOverdue("settled", { ...r, paidOn: "2026-11-17" }, "2026-11-30")).toBe(false);
  });
});

describe("partner wording restates the agreement and nothing more", () => {
  it("states clause 5.4 and 5.3 before settlement", () => {
    const l = partnerPayLine("open", EMPTY_PAY_RECORD).line;
    expect(l).toContain("100% of your fee within 14 days");
    expect(l).toContain("payable only if");
    expect(l).toContain("valid tax invoice");
    expect(l).toContain("clause 5.4");
    expect(l).toContain("indicative");
  });
  it("gives the expected date once invoiced", () => {
    const l = partnerPayLine("settled", rec({ fundsReceivedOn: "2026-11-01", invoiceReceivedOn: "2026-11-05" }));
    expect(l.expectedOn).toBe("2026-11-19");
    expect(l.line).toBe("Tax invoice received 5 Nov 2026. Expected payment by 19 Nov 2026.");
  });
  it("never names Springboard, and never mentions the gross fee or NextKey's share", () => {
    const all = (["open", "settled", "closed"] as const).flatMap((s) => [
      partnerPayLine(s, EMPTY_PAY_RECORD).line,
      partnerPayLine(s, rec({ fundsReceivedOn: "2026-11-01" })).line,
      partnerPayLine(s, rec({ fundsReceivedOn: "2026-11-01", invoiceReceivedOn: "2026-11-02" })).line,
    ]);
    for (const l of all) {
      expect(l).not.toMatch(/springboard/i);
      expect(l).not.toMatch(/gross|retained share|our share/i);
    }
  });
});

describe("introducer wording is Springboard-facing and switched off", () => {
  it("is not enabled until the clause-7 approval is recorded", () => {
    expect(introducerPayTimingEnabled()).toBe(false);
  });
  it("never names NextKey and keeps the 'not near-term' caution", () => {
    const before = introducerPayLine("open", EMPTY_PAY_RECORD).line;
    expect(before).toContain("several months");
    expect(before).toContain("cleared funds");
    for (const s of ["open", "settled", "closed"] as const) {
      expect(introducerPayLine(s, rec({ fundsReceivedOn: "2026-11-01" })).line).not.toMatch(/nextkey/i);
    }
  });
});

describe("staff input", () => {
  const today = "2026-11-17";
  it("refuses dates on a deal that has not settled", () => {
    const r = parsePayUpdate({ funds_received_on: "2026-11-01" }, { settled: false, today });
    expect(r.ok).toBe(false);
  });
  it("allows clearing everything on any deal", () => {
    const r = parsePayUpdate({}, { settled: false, today });
    expect(r).toEqual({
      ok: true,
      update: { funds_received_on: null, invoice_received_on: null, fee_paid_on: null, fee_paid_amount: null },
    });
  });
  it("refuses future and malformed dates", () => {
    expect(parsePayUpdate({ funds_received_on: "2026-11-18" }, { settled: true, today }).ok).toBe(false);
    expect(parsePayUpdate({ funds_received_on: "2026-13-01" }, { settled: true, today }).ok).toBe(false);
  });
  it("needs the fee and the invoice before a payment, and no payment before either", () => {
    expect(parsePayUpdate({ fee_paid_on: "2026-11-10" }, { settled: true, today }).ok).toBe(false);
    expect(
      parsePayUpdate(
        { funds_received_on: "2026-11-05", invoice_received_on: "2026-11-06", fee_paid_on: "2026-11-04" },
        { settled: true, today },
      ).ok,
    ).toBe(false);
  });
  it("takes an amount only with a paid date, and cleans it", () => {
    expect(parsePayUpdate({ fee_paid_amount: "15000" }, { settled: true, today }).ok).toBe(false);
    const r = parsePayUpdate(
      { funds_received_on: "2026-11-01", invoice_received_on: "2026-11-02", fee_paid_on: "2026-11-10", fee_paid_amount: "$15,000.004" },
      { settled: true, today },
    );
    expect(r).toEqual({
      ok: true,
      update: { funds_received_on: "2026-11-01", invoice_received_on: "2026-11-02", fee_paid_on: "2026-11-10", fee_paid_amount: 15000 },
    });
    expect(
      parsePayUpdate(
        { funds_received_on: "2026-11-01", invoice_received_on: "2026-11-02", fee_paid_on: "2026-11-10", fee_paid_amount: "-5" },
        { settled: true, today },
      ).ok,
    ).toBe(false);
  });
});

describe("row mapping and degrade", () => {
  it("maps a row and drops junk", () => {
    expect(
      payRecordFromRow({ funds_received_on: "2026-11-01", invoice_received_on: "nope", fee_paid_on: null, fee_paid_amount: "1234.50" }),
    ).toEqual({ fundsReceivedOn: "2026-11-01", invoiceReceivedOn: null, paidOn: null, paidAmount: 1234.5 });
    expect(payRecordFromRow(null)).toEqual(EMPTY_PAY_RECORD);
  });
  it("recognises 'migration not applied' and nothing else", () => {
    expect(payColumnsMissing({ code: "42703", message: "column partner_enquiries.funds_received_on does not exist" })).toBe(true);
    expect(payColumnsMissing({ code: "42P01", message: "relation does not exist" })).toBe(false);
    expect(payColumnsMissing(null)).toBe(false);
  });
});

describe("monthly statement", () => {
  const deals = [
    { id: "a", lotRef: "NK-1", clientName: "A", settledOn: "2026-09-20", indicativeFee: 15000, pay: rec({ fundsReceivedOn: "2026-10-01", invoiceReceivedOn: "2026-10-02", paidOn: "2026-10-12", paidAmount: 14500 }) },
    { id: "b", lotRef: "NK-2", clientName: "B", settledOn: "2026-10-05", indicativeFee: 20000, pay: EMPTY_PAY_RECORD },
    { id: "c", lotRef: "NK-3", clientName: "C", settledOn: "2026-11-02", indicativeFee: null, pay: rec({ fundsReceivedOn: "2026-11-10" }) },
  ];
  it("puts a paid deal in its paid month and an unpaid one in its settled month, newest first", () => {
    const { months } = buildStatement(deals);
    expect(months.map((m) => m.month)).toEqual(["2026-11", "2026-10"]);
    expect(months[1].rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(months[1].paidTotal).toBe(14500);
    expect(months[1].unpaidTotal).toBe(20000);
  });
  it("totals by status, using what was paid when it was paid", () => {
    const { totals } = buildStatement(deals);
    expect(totals.paid).toEqual({ count: 1, amount: 14500 });
    expect(totals.awaiting_funds).toEqual({ count: 1, amount: 20000 });
    expect(totals.awaiting_invoice).toEqual({ count: 1, amount: 0 });
  });
  it("passes the partner-payload tripwire", () => {
    expect(() => assertNoForbiddenKeys(buildStatement(deals))).not.toThrow();
  });
});

it("response standard is the agreed sentence", () => {
  expect(PARTNER_RESPONSE_STANDARD).toBe("We aim to respond to every referral within 1 business day.");
});
