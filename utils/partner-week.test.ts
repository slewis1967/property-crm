import { describe, expect, it } from "vitest";
import { FORBIDDEN_PARTNER_KEYS } from "./partner";
import { screenPartnerAiValue } from "./partner-ai-guard";
import { buildWeekDraft, mergeAiCopy, personalise, weekEffort, type WeekClient } from "./partner-week";
import { NOW, day, lot } from "./partner-week-fixtures";

const lots = [
  lot({ suburb: "Tarneit", price: 612_000 }),
  lot({ suburb: "Werribee", price: 640_000, bedrooms: 3 }),
  lot({ suburb: "Ripley", state: "QLD", price: 520_000, propertyType: "Townhouse" }),
  lot({ suburb: "Tarneit", price: 590_000 }),
  lot({ suburb: "Box Hill", state: "NSW", price: 980_000, propertyType: "Apartment" }),
  lot({ availability: "unavailable", suburb: "Gone" }),
];
const clients: WeekClient[] = [
  { id: "c1", firstName: "Sam", state: "VIC", budgetMax: 650_000, status: "active", updatedAt: day(90) },
  { id: "c2", firstName: "Lee", state: "QLD", budgetMax: 550_000, status: "active", updatedAt: day(3) },
];
const build = () => buildWeekDraft({ lots, clients, firmName: "Harbour Property", senderName: "Jo", now: NOW });

describe("buildWeekDraft", () => {
  it("drafts 3 social posts, 1 blog, 5 messages and 1 match pack", () => {
    const w = build();
    expect(w.social).toHaveLength(3);
    expect(w.social.map((s) => s.channel)).toEqual(["facebook", "instagram", "wechat"]);
    expect(new Set(w.social.map((s) => s.lot.suburb)).size).toBe(3);
    expect(w.blog?.suburb).toBe("Tarneit");
    expect(w.messages).toHaveLength(5);
    expect(w.match).not.toBeNull();
    expect(w.effort.drafts).toBe(10);
    expect(w.effort.minutesSaved).toBe(3 * 20 + 90 + 5 * 8 + 30);
  });
  it("uses the firm's own clients first, oldest first, then sample leads", () => {
    const w = build();
    expect(w.messages.slice(0, 2).map((m) => [m.clientName, m.sample, m.warmth])).toEqual([
      ["Sam", false, "cold"],
      ["Lee", false, "warm"],
    ]);
    expect(w.messages.slice(2).every((m) => m.sample)).toBe(true);
    expect(w.messages[0].lot.price).toBeLessThanOrEqual(650_000);
  });
  it("builds the match pack for the client with the most matches", () => {
    const w = build();
    expect(w.match?.clientName).toBe("Sam");
    expect(w.match?.sample).toBe(false);
    expect(w.match?.brief).toBe("Up to $650k in VIC");
    expect(w.match?.picks.every((p) => (p.lot.price as number) <= 650_000)).toBe(true);
  });
  it("falls back to a labelled sample brief with no clients", () => {
    const w = buildWeekDraft({ lots, clients: [], firmName: "F", senderName: "Jo", now: NOW });
    expect(w.match?.sample).toBe(true);
    expect(w.messages.every((m) => m.sample)).toBe(true);
  });
  it("keeps the {first_name} placeholder in messages and an opt-out on SMS", () => {
    const w = build();
    for (const m of w.messages) expect(m.body).toContain("{first_name}");
    for (const m of w.messages.filter((x) => x.channel === "sms")) expect(m.body).toMatch(/Reply STOP to opt out/);
    expect(personalise(w.messages[0].body, "Sam")).toMatch(/^Hi Sam,/);
  });
  it("template copy passes the portal screen (firewall, claims, masking)", () => {
    const w = build();
    const copy = {
      social: w.social.map((s) => [s.headline, s.body, s.bodyZh ?? "", s.hashtags]),
      blog: w.blog && [w.blog.title, w.blog.intro, w.blog.sections],
      messages: w.messages.map((m) => [m.subject ?? "", m.body]),
      match: w.match && [w.match.brief, w.match.intro, w.match.picks.map((p) => p.why)],
    };
    expect(screenPartnerAiValue(copy)).toEqual({ ok: true });
  });
  it("carries no masked or fee fields", () => {
    const json = JSON.stringify(build());
    for (const k of FORBIDDEN_PARTNER_KEYS) expect(json).not.toContain(`"${k}"`);
    expect(json).not.toContain("referralFee");
    expect(json).not.toContain("rentWeekly");
    expect(json).not.toContain("25000");
  });
  it("skips unavailable lots", () => {
    expect(JSON.stringify(build())).not.toContain("Gone");
  });
});

describe("mergeAiCopy", () => {
  it("accepts clean rewrites and keeps the template for any draft that fails", () => {
    const base = build();
    const { draft, accepted, rejected } = mergeAiCopy(base, {
      social: [
        { key: "social-0", headline: "Fresh in Tarneit", body: "A lovely new home.", hashtags: ["Tarneit"] },
        { key: "social-1", headline: "Great yield!", body: "Strong rental returns" },
      ],
      blog: { title: "Tarneit guide", intro: "New homes in Tarneit.", sections: [{ heading: "On offer", body: "Four homes." }] },
      messages: [
        { key: "msg-0", subject: "New home", body: "Hi {first_name}, a home came up. Talk soon." },
        { key: "msg-1", body: "Hi {first_name}, low deposit loans available. Reply STOP to opt out." },
        { key: "msg-2", subject: "x", body: "Hi Sam, no placeholder here." },
      ],
      match: { intro: "Built by a top builder." },
    });
    expect(draft.social[0].headline).toBe("Fresh in Tarneit");
    expect(draft.social[0].hashtags).toEqual(["#Tarneit"]);
    expect(draft.social[1].headline).toBe(base.social[1].headline);
    expect(draft.blog?.title).toBe("Tarneit guide");
    expect(draft.messages[0].body).toContain("a home came up");
    expect(draft.messages[1].body).toBe(base.messages[1].body);
    expect(draft.messages[2].body).toBe(base.messages[2].body);
    expect(draft.match?.intro).toBe(base.match?.intro);
    expect(accepted).toBe(3);
    expect(rejected.map((r) => r.key).sort()).toEqual(["match", "msg-1", "msg-2", "social-1"]);
    expect(draft.writer).toBe("ai");
  });
  it("rejects supplier names the model guessed", () => {
    const base = build();
    const { rejected } = mergeAiCopy(base, { social: [{ key: "social-0", body: "Now at Aurora Heights" }] }, { supplierNames: ["Aurora Heights"] });
    expect(rejected[0].reasons).toContain("mask:supplier-name");
  });
  it("stays template when nothing passes", () => {
    expect(mergeAiCopy(build(), {}).draft.writer).toBe("template");
  });
  it("leaves the effort figures alone", () => {
    const base = build();
    expect(weekEffort(mergeAiCopy(base, {}).draft)).toEqual(base.effort);
  });
});
