import { describe, expect, it } from "vitest";
import {
  bestSiteEmail,
  buildContactProposals,
  contactFreshness,
  decodeCfEmail,
  extractEmails,
  extractPhones,
  formatAuPhone,
  needsReview,
  parseAiLookup,
  phoneKey,
  registrableDomain,
  type AiLookup,
  type SiteScan,
} from "./channel-partner-contacts";

/** Encode the way Cloudflare's email protection does: key byte, then each char XOR key. */
function cfEncode(email: string, key = 0x5a): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return hex(key) + [...email].map((c) => hex(c.charCodeAt(0) ^ key)).join("");
}

const scan = (over: Partial<SiteScan> = {}): SiteScan => ({ reachable: true, pages: [], emails: [], phones: [], text: "", ...over });
const ai = (over: Partial<AiLookup> = {}): AiLookup => ({
  still_trading: true,
  contact_name: null,
  contact_role: null,
  email: null,
  phone: null,
  website: null,
  sources: [],
  notes: null,
  ...over,
});
const current = { email: null, phone: null, contact_name: null, contact_role: null, website: "https://goldpropertypartners.com.au" };

describe("contactFreshness", () => {
  const now = new Date("2026-09-11T00:00:00Z");
  it("is fresh up to 90 days, stale after, never when unset", () => {
    expect(contactFreshness(null, now).state).toBe("never");
    expect(contactFreshness("2026-06-13T00:00:00Z", now)).toEqual({ state: "fresh", days: 90 });
    expect(contactFreshness("2026-06-12T00:00:00Z", now).state).toBe("stale");
    expect(contactFreshness("garbage", now).state).toBe("never");
  });
});

describe("decodeCfEmail / extractEmails", () => {
  it("decodes Cloudflare-protected addresses (several CSV firms hide theirs this way)", () => {
    expect(decodeCfEmail(cfEncode("build@goldpp.com.au"))).toBe("build@goldpp.com.au");
    expect(decodeCfEmail("zz")).toBeNull();
  });
  it("finds mailto, plain-text and protected addresses, and drops junk", () => {
    const html = `
      <a href="mailto:Hello@Acme.com.au?subject=hi">Email</a>
      <span class="__cf_email__" data-cfemail="${cfEncode("partners@acme.com.au")}">[email&#160;protected]</span>
      <a href="/cdn-cgi/l/email-protection#${cfEncode("tim@acme.com.au")}">x</a>
      <p>Or write to admin@acme.com.au.</p>
      <img src="logo@2x.png"> <script>var x="sentry@sentry.io"</script> you@example.com`;
    expect(extractEmails(html).sort()).toEqual(
      ["admin@acme.com.au", "hello@acme.com.au", "partners@acme.com.au", "tim@acme.com.au"].sort(),
    );
  });
});

describe("phones", () => {
  it("normalises AU numbers to one comparable key", () => {
    expect(phoneKey("+61 413 108 125")).toBe("0413108125");
    expect(phoneKey("0413 108 125")).toBe("0413108125");
    expect(phoneKey("(07) 5438 9775")).toBe("0754389775");
  });
  it("finds tel: links and written landline, mobile, 1300/1800 and 13 numbers", () => {
    const html = `<a href="tel:+61754389775">call</a> Office (07) 5438 9775 · Mobile 0421 412 141 · 1300 38 66 34 · 13 22 11 · ABN 49 634 656 947`;
    const keys = extractPhones(html).map(phoneKey).sort();
    expect(keys).toEqual(["0421412141", "0754389775", "1300386634", "132211"].sort());
  });
  it("ignores digit strings that aren't written like phone numbers (seen live: an ID '034639019-9')", () => {
    expect(extractPhones("Ref 034639019-9 · ABN 49 634 656 947 · Lic 4123456789")).toEqual([]);
  });
  it("formats a number the way it's written in AU", () => {
    expect(formatAuPhone("+61754389775")).toBe("07 5438 9775");
    expect(formatAuPhone("+61 413 108 125")).toBe("0413 108 125");
    expect(formatAuPhone("1300386634")).toBe("1300 386 634");
    expect(formatAuPhone("132211")).toBe("13 22 11");
  });
});

describe("extractEmails — real-page junk", () => {
  it("strips a stray prefix from a malformed mailto (seen live: 'mailto:#steve@…')", () => {
    expect(extractEmails('<a href="mailto:#steve@ndisproperty.net.au">x</a>')).toEqual(["steve@ndisproperty.net.au"]);
  });
});

describe("registrableDomain", () => {
  it("keeps three labels for two-part AU suffixes", () => {
    expect(registrableDomain("https://www.goldpropertypartners.com.au/contact")).toBe("goldpropertypartners.com.au");
    expect(registrableDomain("build@goldpp.com.au")).toBe("goldpp.com.au");
    expect(registrableDomain("https://colivinghomes.au")).toBe("colivinghomes.au");
    expect(registrableDomain("https://www.prgpi.com")).toBe("prgpi.com");
    expect(registrableDomain(null)).toBeNull();
  });
});

describe("bestSiteEmail", () => {
  it("prefers the named contact, then a partnerships inbox, then a general one; own domain only", () => {
    const site = "https://acme.com.au";
    expect(bestSiteEmail(["info@acme.com.au", "tim@acme.com.au"], site, "Tim Gold")).toBe("tim@acme.com.au");
    expect(bestSiteEmail(["info@acme.com.au", "partners@acme.com.au"], site, null)).toBe("partners@acme.com.au");
    expect(bestSiteEmail(["noreply@acme.com.au", "info@acme.com.au"], site, null)).toBe("info@acme.com.au");
    expect(bestSiteEmail(["someone@gmail.com"], site, null)).toBeNull();
  });
});

describe("buildContactProposals — confirmed only when the firm's own site says so", () => {
  it("marks a current email found on the site as 'same'", () => {
    const out = buildContactProposals({ ...current, email: "build@goldpp.com.au" }, scan({ emails: ["build@goldpp.com.au"] }), null);
    expect(out.find((x) => x.field === "email")).toMatchObject({ status: "same", recommended: false });
  });

  it("proposes the site's address when ours isn't published, pre-ticked", () => {
    const out = buildContactProposals({ ...current, email: "old@goldpropertypartners.com.au" }, scan({ emails: ["hello@goldpropertypartners.com.au"] }), null);
    expect(out.find((x) => x.field === "email")).toMatchObject({ status: "confirmed", proposed: "hello@goldpropertypartners.com.au", recommended: true });
  });

  it("an AI-suggested email the site doesn't show is 'unconfirmed' and never pre-ticked", () => {
    const out = buildContactProposals(current, scan({ emails: [] }), ai({ email: "tim.gold@goldpropertypartners.com.au" }));
    expect(out.find((x) => x.field === "email")).toMatchObject({ status: "unconfirmed", recommended: false });
  });

  it("flags a detail that has vanished from a site that answered, without clearing it", () => {
    const out = buildContactProposals({ ...current, email: "a@goldpropertypartners.com.au", phone: "07 5438 9775" }, scan(), null);
    expect(out.find((x) => x.field === "email")).toMatchObject({ status: "gone", proposed: null, recommended: false });
    expect(out.find((x) => x.field === "phone")).toMatchObject({ status: "gone" });
  });

  it("says nothing about a vanished detail when the site didn't answer (no evidence either way)", () => {
    const out = buildContactProposals({ ...current, email: "a@goldpropertypartners.com.au" }, scan({ reachable: false }), null);
    expect(out.find((x) => x.field === "email")).toBeUndefined();
  });

  it("matches phones across formats", () => {
    const out = buildContactProposals({ ...current, phone: "07 5438 9775" }, scan({ phones: ["(07) 5438 9775"] }), null);
    expect(out.find((x) => x.field === "phone")?.status).toBe("same");
  });

  it("a name seen on the site fills a blank; it never silently replaces a person", () => {
    const seen = buildContactProposals(current, scan({ text: "meet tim gold, managing director" }), ai({ contact_name: "Tim Gold", contact_role: "Managing Director" }));
    expect(seen.find((x) => x.field === "contact_name")).toMatchObject({ status: "confirmed", recommended: true });
    const replacing = buildContactProposals({ ...current, contact_name: "Kelly Gold" }, scan({ text: "tim gold" }), ai({ contact_name: "Tim Gold" }));
    expect(replacing.find((x) => x.field === "contact_name")).toMatchObject({ status: "confirmed", recommended: false });
  });
});

describe("needsReview", () => {
  it("a silent site or a closure is always worth a look", () => {
    expect(needsReview([], false, null)).toBe(true);
    expect(needsReview([], true, false)).toBe(true);
    expect(needsReview([], true, true)).toBe(false);
  });
  it("an unconfirmed name/role suggestion doesn't flag the row; an unconfirmed email does", () => {
    const role = { field: "contact_role", current: "Founder", proposed: "Managing Director", status: "unconfirmed", evidence: "", recommended: false } as const;
    const email = { ...role, field: "email", current: "a@b.com.au", proposed: "c@b.com.au" } as const;
    expect(needsReview([role], true, true)).toBe(false);
    expect(needsReview([email], true, true)).toBe(true);
  });
});

describe("parseAiLookup", () => {
  it("parses fenced JSON and turns 'unknown'/'null' strings into null", () => {
    const r = parseAiLookup('```json\n{"still_trading":true,"contact_name":"unknown","email":"Tim@Gold.com.au","phone":null,"sources":["https://x.com.au"]}\n```');
    expect(r).toMatchObject({ still_trading: true, contact_name: null, email: "tim@gold.com.au", phone: null, sources: ["https://x.com.au"] });
  });
  it("rejects a malformed email and non-JSON answers", () => {
    expect(parseAiLookup('{"email":"not an email"}')?.email).toBeNull();
    expect(parseAiLookup("I couldn't find anything.")).toBeNull();
  });
});
