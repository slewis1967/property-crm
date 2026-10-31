/**
 * The gates on the two routes that matter most: issuing (a tax document is
 * created) and sending (an email leaves the business).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invoice, InvoiceSettings } from "../../../../utils/invoices";

const m = vi.hoisted(() => ({
  invoice: null as Record<string, unknown> | null,
  settings: {} as Record<string, unknown>,
  sendBrevoEmail: vi.fn(),
  htmlToPdf: vi.fn(),
  logInvoiceEvent: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../../../../utils/cf-access", () => ({ requireAuth: async () => "tester@example.com" }));
vi.mock("../../../../utils/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  errInfo: () => ({}),
}));
vi.mock("../../../../utils/brevo", () => ({ sendBrevoEmail: m.sendBrevoEmail }));
vi.mock("../../../../utils/pdf/render", () => ({ htmlToPdf: m.htmlToPdf }));
vi.mock("../../../../utils/invoices-store", () => ({
  loadInvoice: async () => m.invoice,
  loadSettings: async () => m.settings,
  logInvoiceEvent: m.logInvoiceEvent,
}));
vi.mock("../../../../utils/supabase", () => ({
  supabase: {
    from: () => ({
      update: (row: unknown) => {
        m.update(row);
        const result = { error: null };
        const chain = { eq: () => chain, then: (done: (r: typeof result) => unknown) => done(result) };
        return chain;
      },
    }),
    rpc: m.rpc,
  },
}));

import { POST as issue } from "./issue/route";
import { POST as send } from "./send/route";
import { POST as voidInvoice } from "./void/route";
import { POST as addPayment, DELETE as removePayment } from "./payments/route";
import { PUT as saveSettings } from "../settings/route";

const SETTINGS: Partial<InvoiceSettings> = {
  seller_name: "NextKey Pty Ltd",
  abn: "28 689 818 264",
  bsb: "000-000",
  account_name: "NextKey Pty Ltd",
  account_number: "12345678",
  email: "accounts@example.com",
  cc_emails: "copy@example.com, buyer@example.com",
};

const ISSUED: Partial<Invoice> = {
  id: "i1",
  number: 1072,
  status: "issued",
  trading_as: null,
  issue_date: "2026-11-01",
  due_date: "2026-11-08",
  buyer_name: "Sample Buyer",
  buyer_email: "buyer@example.com",
  lines: [{ description: "Fee", quantity: 1, unit_cents: 1100, gst: "taxable" }],
  amounts_include_gst: true,
  total_cents: 1100,
  amount_paid_cents: 0,
  reminder_count: 0,
  updated_at: "2026-11-01T00:00:00.123456+00:00",
};

const ctx = { params: Promise.resolve({ id: "i1" }) };
const request = (body?: unknown) =>
  new Request("https://crm.test/api", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  m.settings = { ...SETTINGS };
  m.invoice = { ...ISSUED };
  m.htmlToPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  m.sendBrevoEmail.mockResolvedValue({ ok: true, messageId: "m1" });
  m.rpc.mockResolvedValue({ data: 1072, error: null });
});

describe("POST issue", () => {
  it("refuses a draft that isn't a valid tax invoice, and takes no number", async () => {
    m.invoice = { ...ISSUED, status: "draft", number: null, buyer_name: null, lines: [] };
    const res = await issue(request(), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).problems.length).toBeGreaterThan(0);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("refuses to issue twice", async () => {
    const res = await issue(request(), ctx);
    expect(res.status).toBe(409);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("issues with totals from the lines and the version it checked, in one call", async () => {
    m.invoice = { ...ISSUED, status: "draft", number: null, total_cents: 999999 };
    const res = await issue(request(), ctx);
    expect(await res.json()).toEqual({ ok: true, number: 1072 });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.rpc).toHaveBeenCalledWith(
      "issue_invoice",
      expect.objectContaining({
        p_id: "i1",
        p_actor: "tester@example.com",
        p_expected_updated_at: "2026-11-01T00:00:00.123456+00:00",
        p_subtotal_cents: 1000,
        p_gst_cents: 100,
        p_total_cents: 1100,
      }),
    );
  });

  it("reports a draft that changed under it, with nothing issued", async () => {
    m.invoice = { ...ISSUED, status: "draft", number: null };
    m.rpc.mockResolvedValue({ data: null, error: { message: "This draft was changed just now. Check it and issue it again." } });
    const res = await issue(request(), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/changed just now/);
  });
});

describe("PUT settings", () => {
  const put = (body: unknown) => new Request("https://crm.test/api", { method: "PUT", body: JSON.stringify(body) });

  it("refuses anyone but the super admin", async () => {
    vi.stubEnv("SUPER_ADMIN_EMAILS", "owner@example.com");
    const res = await saveSettings(put({ account_number: "99999999" }));
    expect(res.status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
  });

  it("saves for the super admin, recording who", async () => {
    vi.stubEnv("SUPER_ADMIN_EMAILS", "tester@example.com");
    const res = await saveSettings(put({ account_number: "99999999" }));
    expect(res.status).toBe(200);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ account_number: "99999999", updated_by: "tester@example.com" }));
  });
});

describe("POST void", () => {
  const voidRequest = (reason?: string) => request(reason ? { reason } : {});

  it("goes through the locking function", async () => {
    m.rpc.mockResolvedValue({ data: null, error: null });
    const res = await voidInvoice(voidRequest("Wrong buyer"), ctx);
    expect(res.status).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith("void_invoice", { p_id: "i1", p_actor: "tester@example.com", p_reason: "Wrong buyer" });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("refuses an invoice with payments, and passes on the function's refusal", async () => {
    m.invoice = { ...ISSUED, amount_paid_cents: 100 };
    expect((await voidInvoice(voidRequest("x"), ctx)).status).toBe(409);
    expect(m.rpc).not.toHaveBeenCalled();

    m.invoice = { ...ISSUED };
    m.rpc.mockResolvedValue({ data: null, error: { message: "Remove its payments before voiding it." } });
    const res = await voidInvoice(voidRequest("x"), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Remove its payments/);
  });
});

describe("payments", () => {
  it("records through the locking function", async () => {
    m.rpc.mockResolvedValue({ data: null, error: null });
    const res = await addPayment(request({ amount: "11.00", paid_on: "2026-11-02", method: " EFT " }), ctx);
    expect(res.status).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith("record_invoice_payment", {
      p_id: "i1",
      p_cents: 1100,
      p_paid_on: "2026-11-02",
      p_method: "EFT",
      p_note: null,
      p_actor: "tester@example.com",
    });
  });

  it("says when the payment to remove isn't on this invoice", async () => {
    m.rpc.mockResolvedValue({ data: false, error: null });
    const res = await removePayment(new Request("https://crm.test/api?payment=p1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
  });
});

describe("POST send", () => {
  it("never emails a draft or a voided invoice", async () => {
    for (const status of ["draft", "void"]) {
      m.invoice = { ...ISSUED, status };
      const res = await send(request({ kind: "invoice" }), ctx);
      expect(res.status).toBe(409);
    }
    expect(m.sendBrevoEmail).not.toHaveBeenCalled();
  });

  it("won't send a reminder when nothing is owing", async () => {
    m.invoice = { ...ISSUED, amount_paid_cents: 1100 };
    const res = await send(request({ kind: "reminder" }), ctx);
    expect(res.status).toBe(409);
    expect(m.sendBrevoEmail).not.toHaveBeenCalled();
  });

  it("needs a real address for the buyer", async () => {
    m.invoice = { ...ISSUED, buyer_email: "not an address" };
    const res = await send(request({ kind: "invoice" }), ctx);
    expect(res.status).toBe(422);
    expect(m.sendBrevoEmail).not.toHaveBeenCalled();
  });

  it("doesn't mark it as sent if the email fails, or show provider details", async () => {
    m.sendBrevoEmail.mockResolvedValue({ ok: false, error: "Brevo 401: bad key" });
    const res = await send(request({ kind: "invoice" }), ctx);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("Brevo");
    expect(m.update).not.toHaveBeenCalled();
    expect(m.logInvoiceEvent).not.toHaveBeenCalled();
  });

  it("sends the PDF as a non-marketing email and stamps it", async () => {
    const res = await send(request({ kind: "invoice" }), ctx);
    expect(await res.json()).toEqual({ ok: true, to: "buyer@example.com" });
    const options = m.sendBrevoEmail.mock.calls[0][0];
    expect(options.to).toEqual([{ email: "buyer@example.com", name: "Sample Buyer" }]);
    expect(options.cc).toEqual([{ email: "copy@example.com" }]);
    expect(options.commercial).toBeUndefined();
    expect(options.replyTo).toBe("accounts@example.com");
    expect(options.attachments[0]).toEqual({ name: "Invoice_1072.pdf", content: "AQID" });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ sent_at: expect.any(String) }));
  });

  it("uses the details the invoice was issued with, not today's settings", async () => {
    m.invoice = { ...ISSUED, seller_snapshot: { email: "then@example.com" } };
    await send(request({ kind: "invoice" }), ctx);
    expect(m.sendBrevoEmail.mock.calls[0][0].replyTo).toBe("then@example.com");
  });

  it("sends Springboard invoices from the Springboard address", async () => {
    m.invoice = { ...ISSUED, trading_as: "Springboard Homes" };
    await send(request({ kind: "invoice" }), ctx);
    expect(m.sendBrevoEmail.mock.calls[0][0].fromEmail).toMatch(/springboard/i);
  });

  it("counts a reminder separately from the first send", async () => {
    await send(request({ kind: "reminder" }), ctx);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ reminder_count: 1, last_reminder_at: expect.any(String) }));
    expect(m.update).not.toHaveBeenCalledWith(expect.objectContaining({ sent_at: expect.any(String) }));
  });
});
