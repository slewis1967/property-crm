import { describe, it, expect } from "vitest";
import { HELP_ENTRIES, HELP_BY_KEY, HELP_FAQ, JOURNEY, MYGOV_VIDEO } from "./portal-help";
import { YLA_DOCUMENTS } from "./yla-documents";

describe("help content", () => {
  it("covers every document we actually ask for", () => {
    // A slot with no help entry is a client with nowhere to turn.
    for (const doc of YLA_DOCUMENTS) {
      expect(HELP_BY_KEY[doc.key], `no help entry for ${doc.key}`).toBeDefined();
    }
  });

  it("says an ATO statement is one PER EMPLOYER, not one per year", () => {
    const ato = HELP_BY_KEY.ato_income!;
    const all = [...ato.what, ...ato.how, ...ato.avoid].join(" ");
    expect(all).toMatch(/separate statement for each employer/i);
    expect(all).not.toMatch(/not two employers/i);
  });

  it("names the three documents clients wrongly send for the ATO one", () => {
    const what = HELP_BY_KEY.ato_income!.what.join(" ");
    expect(what).toMatch(/tax return/i);
    expect(what).toMatch(/notice of assessment/i);
    expect(what).toMatch(/employer/i);
  });

  it("asks for both sides of a licence", () => {
    expect(HELP_BY_KEY.photo_id!.what.join(" ")).toMatch(/BOTH sides/i);
  });

  it("every entry says what it is, how to get it and what to avoid", () => {
    for (const e of HELP_ENTRIES) {
      expect(e.what.length, e.docKey).toBeGreaterThan(0);
      expect(e.how.length, e.docKey).toBeGreaterThan(0);
      expect(e.avoid.length, e.docKey).toBeGreaterThan(0);
    }
  });
});

describe("the myGov video", () => {
  it("is served from our own origin, not a third party", () => {
    // Self-hosting is the point: no other firm's branding on a client page, no
    // CSP exception, and no third-party cookie beside identity documents.
    expect(MYGOV_VIDEO.src.startsWith("/api/portal/")).toBe(true);
    expect(MYGOV_VIDEO.src).not.toMatch(/^https?:\/\//);
    expect(MYGOV_VIDEO.src).not.toMatch(/youtube|vimeo|wistia/i);
  });

  it("has a poster, so the player doesn't open on a black rectangle", () => {
    expect(MYGOV_VIDEO.poster.startsWith("/api/portal/")).toBe(true);
    expect(MYGOV_VIDEO.poster).not.toMatch(/^https?:\/\//);
  });
});

describe("the journey", () => {
  it("is numbered in order with no gaps", () => {
    expect(JOURNEY.map((s) => s.n)).toEqual(JOURNEY.map((_, i) => i + 1));
  });

  it("says the adviser charges a fee — the omission that paused the ads", () => {
    const advice = JOURNEY.find((s) => /advice/i.test(s.title))!;
    expect(advice.detail).toMatch(/fee/i);
  });

  it("makes no product, eligibility or investment claim", () => {
    // Springboard is Program Manager, not adviser. The product, who qualifies,
    // and anything about investing belong to the licensed adviser's Statement of
    // Advice — never to a page we publish. Asking a client to fetch their super
    // STATEMENT is document collection and is fine; describing super as
    // something they invest is not.
    const text = [
      ...JOURNEY.flatMap((s) => [s.title, s.detail, s.who]),
      ...HELP_FAQ.flatMap((f) => [f.q, f.a]),
      ...HELP_ENTRIES.flatMap((e) => [e.title, ...e.what, ...e.how, ...e.avoid]),
    ]
      .join(" ")
      // Strip the legitimate document-retrieval mentions before scanning.
      .replace(/super(annuation)? statement/gi, "")
      .replace(/your super fund's (website|app)/gi, "")
      .replace(/from myGov under Super/gi, "");

    const forbidden: [RegExp, string][] = [
      [/\bSMSF\b/i, "self-managed super funds are the adviser's territory"],
      [/\binvest(ing|ment|or)?\b/i, "we must not describe the investment side"],
      [/\brollover\b/i, "super mechanics"],
      [/\breturn of \d|\d(\.\d)?% ?pa\b/i, "no return figures"],
      [/\beligib/i, "eligibility is assessed elsewhere, never stated by us"],
      [/\bguarantee/i, "no guarantees"],
      [/you (?:will|are) approved/i, "no approval promises"],
    ];
    for (const [pattern, why] of forbidden) {
      expect(text, `${pattern} — ${why}`).not.toMatch(pattern);
    }
  });
});
