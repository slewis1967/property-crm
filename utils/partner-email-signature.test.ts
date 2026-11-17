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
