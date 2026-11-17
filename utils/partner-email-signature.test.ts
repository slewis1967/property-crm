import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: Array<Record<string, unknown>> = [];
let glennSig: Record<string, unknown> | null = null;

vi.mock("./brevo", () => ({
  sendBrevoEmail: vi.fn(async (opts: Record<string, unknown>) => {
    sent.push(opts);
    return { ok: true };
  }),
}));
vi.mock("./email-signature", () => ({
  getOwnSignatureFields: vi.fn(async () => glennSig),
  renderSignature: vi.fn((f: { name: string; phone: string }) => ({
    html: `<div class="sig">${f.name} ${f.phone}</div>`,
    text: `${f.name} ${f.phone}`,
  })),
}));

import { PARTNER_SIGNATORY_EMAIL, sendAgreementAcceptedEmail } from "./partner-email";

const args = {
  to: "jane@example.com",
  name: "Jane Citizen",
  firmName: "Example Advisory",
  entityName: "Example Advisory Pty Ltd",
  version: "v1.0",
  acceptedAt: "17 November 2026",
};

describe("agreement email is sent as Glenn", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("comes from Glenn's address and carries his signature", async () => {
    glennSig = { name: "Glenn Mayes", email: PARTNER_SIGNATORY_EMAIL, phone: "0477201245", title: "Director" };
    const r = await sendAgreementAcceptedEmail(args);
    expect(r.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].fromEmail).toBe("glenn.m@nextkey.com.au");
    expect(sent[0].fromName).toBe("Glenn Mayes");
    expect(String(sent[0].html)).toContain('<div class="sig">Glenn Mayes 0477201245</div>');
    expect(String(sent[0].html)).not.toMatch(/sean\.l@|0488/);
  });

  it("is not sent at all without a signature on file", async () => {
    glennSig = null;
    const r = await sendAgreementAcceptedEmail(args);
    expect(r.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe("every partner-facing email is sent as Glenn", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("invitation and deal update come from Glenn, signed, with no staff address in them", async () => {
    glennSig = { name: "Glenn Mayes", email: PARTNER_SIGNATORY_EMAIL, phone: "0477201245", title: "Director" };
    const { sendPartnerInviteEmail, sendDealUpdateEmail } = await import("./partner-email");
    await sendPartnerInviteEmail({ to: "jane@example.com", name: "Jane", firmName: "Example", invitedBy: "sean.l@nextkey.com.au" });
    await sendDealUpdateEmail({ to: "jane@example.com", name: "Jane", lotRef: "NK-1", clientName: "Bob", headline: "Hold granted", body: "b", enquiryId: "x" });
    expect(sent).toHaveLength(2);
    for (const m of sent) {
      expect(m.fromEmail).toBe("glenn.m@nextkey.com.au");
      expect(String(m.html)).toContain("Glenn Mayes 0477201245");
      expect(String(m.html)).not.toMatch(/sean\.l@|0488/);
    }
  });

  it("invitation and deal update are not sent without his signature", async () => {
    glennSig = null;
    const { sendPartnerInviteEmail, sendDealUpdateEmail } = await import("./partner-email");
    expect((await sendPartnerInviteEmail({ to: "a@b.co", name: null, firmName: "X", invitedBy: "s" })).ok).toBe(false);
    expect((await sendDealUpdateEmail({ to: "a@b.co", name: null, lotRef: "NK-1", clientName: "B", headline: "h", body: "b", enquiryId: "x" })).ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("a sign-in code is never blocked: it still goes from Glenn, unsigned, if his signature is missing", async () => {
    glennSig = null;
    const { sendPartnerLoginEmail } = await import("./partner-email");
    const r = await sendPartnerLoginEmail({ to: "a@b.co", name: null, linkToken: "t", code: "123456", expiresAt: new Date(Date.now() + 600_000) });
    expect(r.ok).toBe(true);
    expect(sent[0].fromEmail).toBe("glenn.m@nextkey.com.au");
  });
});
