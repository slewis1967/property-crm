import { describe, expect, it } from "vitest";
import {
  AI_AGENTS,
  AI_USAGE_LINE,
  ANNUAL_WEBSITE_BONUS,
  ELITE_TERMS,
  PLAN_ORDER,
  PLAN_PRICING,
  TRIAL_CTA,
  annualEffectiveMonthly,
  capAlertsLabel,
  foundingPlacesLeft,
  isAgentId,
  planCards,
  priceLabel,
} from "./partner-plans";

describe("plan pricing config", () => {
  it("holds Sean's confirmed figures (18 Nov 2026)", () => {
    expect(PLAN_PRICING.elite).toMatchObject({ monthly: 699, aiIncluded: 150, confirmed: true });
    expect(PLAN_PRICING.enterprise).toMatchObject({ monthly: 399, setup: 1500, confirmed: true });
    expect(ELITE_TERMS).toMatchObject({ foundingMonthly: 499, foundingPlaces: 10, foundingLockMonths: 12, overageMultiplier: 1.3, annualMonthsPaid: 10 });
  });
  it("keeps the unconfirmed values marked TBC", () => {
    expect(PLAN_PRICING.basic.confirmed).toBe(false);
    expect(PLAN_PRICING.professional.confirmed).toBe(false);
    expect(ELITE_TERMS.trialConfirmed).toBe(false);
  });
  it("orders columns with Enterprise beside Elite", () => {
    expect(PLAN_ORDER).toEqual(["basic", "professional", "enterprise", "elite"]);
  });
  it("prices annual as 10 months for 12", () => {
    expect(annualEffectiveMonthly(699)).toBe(583);
    expect(annualEffectiveMonthly(1200, 10)).toBe(1000);
  });
  it("labels prices", () => {
    expect(priceLabel({ monthly: 0 })).toBe("Free");
    expect(priceLabel({ monthly: 1500 })).toBe("$1,500");
  });
  it("counts founding places and never goes negative", () => {
    expect(foundingPlacesLeft({ foundingPlaces: 10, foundingPlacesTaken: 3 })).toBe(7);
    expect(foundingPlacesLeft({ foundingPlaces: 10, foundingPlacesTaken: 12 })).toBe(0);
  });
  it("words the cap alerts", () => {
    expect(capAlertsLabel()).toBe("50%, 80% and 100%");
  });
  it("uses the agreed billing and trial wording", () => {
    expect(AI_USAGE_LINE).toBe("AI usage, billed monthly");
    expect(TRIAL_CTA).toBe("Start your 21-day Elite trial — no card");
    expect(ELITE_TERMS.trialFallsBackTo).toBe("professional");
  });
  it("builds four cumulative cards with no 'most popular' label", () => {
    const cards = planCards();
    expect(cards.map((c) => c.id)).toEqual(PLAN_ORDER);
    expect(cards[0].includesFrom).toBeNull();
    expect(cards[3].includesFrom).toBe("enterprise");
    expect(JSON.stringify(cards).toLowerCase()).not.toContain("popular");
  });
  it("puts no dollar value or page count on the annual website bonus", () => {
    const json = JSON.stringify(ANNUAL_WEBSITE_BONUS);
    expect(json).not.toMatch(/\$/);
    expect(json).not.toMatch(/\d+\s*pages?/i);
    expect(ANNUAL_WEBSITE_BONUS.appliesTo).toEqual(["enterprise", "elite"]);
  });
});

describe("agents", () => {
  it("never claims to post to WeChat for the partner", () => {
    const wechat = AI_AGENTS.find((a) => a.id === "wechat")!;
    expect(JSON.stringify(wechat)).not.toMatch(/we post|auto-?post/i);
    expect(wechat.delivery).toMatch(/you post/i);
  });
  it("marks Meta publishing as coming soon", () => {
    for (const id of ["facebook", "instagram"]) expect(AI_AGENTS.find((a) => a.id === id)!.deliveryComingSoon).toBe(true);
  });
  it("re-engage states own sender, approval, unsubscribe and AI disclosure", () => {
    const r = JSON.stringify(AI_AGENTS.find((a) => a.id === "reengage"));
    expect(r).toMatch(/your own email and number/);
    expect(r).toMatch(/approve every message/);
    expect(r).toMatch(/Unsubscribe/);
    expect(r).toMatch(/AI assistant/);
  });
  it("never says Claude credits or Claude access", () => {
    expect(JSON.stringify(AI_AGENTS)).not.toMatch(/claude (credits|access)/i);
  });
  it("validates agent ids", () => {
    expect(isAgentId("seo")).toBe(true);
    expect(isAgentId("tiktok")).toBe(false);
  });
});
