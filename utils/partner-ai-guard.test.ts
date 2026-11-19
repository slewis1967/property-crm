import { describe, expect, it } from "vitest";
import { PORTAL_AI_RULES, screenPartnerAiText, screenPartnerAiValue } from "./partner-ai-guard";

const bad = (t: string, opts = {}) => {
  const r = screenPartnerAiText(t, opts);
  return r.ok ? [] : r.reasons;
};

describe("screenPartnerAiText", () => {
  it("passes clean marketing copy", () => {
    expect(screenPartnerAiText("A brand-new 4-bedroom home in Tarneit VIC, $612,000. Message us for details, quote NK-ABC123.").ok).toBe(true);
    expect(screenPartnerAiText("Call Glenn on 0477 201 245 for details.").ok).toBe(true);
  });
  it("blocks the brand firewall terms", () => {
    expect(bad("Buy it through your SMSF")).toContain("firewall:super");
    expect(bad("Use your super to buy")).toContain("firewall:super");
    expect(bad("Finance options available")).toContain("firewall:finance");
    expect(bad("Low-deposit home loans")).toContain("firewall:finance");
    expect(bad("Great credit terms")).toContain("firewall:finance");
    expect(bad("Brought to you by Springboard")).toContain("firewall:springboard");
  });
  it("blocks rent, yield and growth claims", () => {
    expect(bad("Rents for $650 a week")).toContain("claims:rent");
    expect(bad("A 5% rental yield")).toEqual(expect.arrayContaining(["claims:rent", "claims:yield"]));
    expect(bad("Strong capital growth expected")).toContain("claims:growth");
  });
  it("blocks referral fee and commission talk", () => {
    expect(bad("Earn a $20,000 referral fee")).toContain("fee");
    expect(bad("Big commissions")).toContain("fee");
  });
  it("blocks masking breaches", () => {
    expect(bad("Lot 417 is available")).toContain("mask:lot");
    expect(bad("Located at 12 Smith Street")).toContain("mask:address");
    expect(bad("Built by a leading builder")).toContain("mask:supplier");
    expect(bad("Now selling at Aurora Heights", { supplierNames: ["Aurora Heights"] })).toContain("mask:supplier-name");
  });
  it("blocks contacts other than Glenn", () => {
    expect(bad("Call 0412 345 678")).toContain("contact:phone");
    expect(bad("Email sales@example.com")).toContain("contact:email");
    expect(bad("Ask Sean")).toContain("contact:sean");
  });
  it("blocks WeChat auto-posting claims and Claude-credit wording", () => {
    expect(bad("We will post this to WeChat for you")).toContain("claims:wechat-autopost");
    expect(bad("Includes Claude credits")).toContain("billing:claude");
  });
  it("blocks banned terms written in Chinese", () => {
    expect(bad("低首付贷款")).toContain("firewall:zh");
    expect(bad("租金回报高")).toContain("firewall:zh");
    expect(screenPartnerAiText("【新房推荐】Tarneit VIC · 4居室独立屋，总价 $612,000。").ok).toBe(true);
  });
});

describe("screenPartnerAiValue", () => {
  it("walks nested structures", () => {
    expect(screenPartnerAiValue({ a: ["fine", { b: "home loan" }] }).ok).toBe(false);
    expect(screenPartnerAiValue({ a: ["fine", { b: "still fine" }] }).ok).toBe(true);
  });
});

describe("PORTAL_AI_RULES", () => {
  it("states every rule in the system prompt", () => {
    for (const s of ["SMSF", "Springboard", "credit", "yield", "capital growth", "referral fee", "builder", "lot number", "street address", "0477 201 245"]) {
      expect(PORTAL_AI_RULES).toContain(s);
    }
  });
});
