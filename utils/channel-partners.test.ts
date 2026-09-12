import { describe, expect, it } from "vitest";
import {
  SMSF_YLA_PARAGRAPH,
  SMSF_YLA_SCRIPT_LINE,
  SPRINGBOARD_PARAGRAPH,
  buildCallScript,
  buildPitchEmail,
  coercePartnerBody,
  greetingName,
  niceCount,
  parseStreams,
  pitchTextToHtml,
  stockSentence,
  summarisePartners,
  type ChannelPartner,
  type StockStats,
} from "./channel-partners";

const stats: StockStats = { available: 1628, builders: 152, suburbs: 162, addedLast30: 291, asAt: "2026-09-11T03:00:00Z" };

const partner = (over: Partial<ChannelPartner>): ChannelPartner => ({
  id: "x",
  company: "Acme Property",
  channel_type: "Property marketer",
  nextkey_stream_fit: "Core investor",
  stock_focus: null,
  supply_model: null,
  suggested_priority: "A",
  priority_reason: null,
  contact_name: null,
  contact_role: null,
  email: null,
  phone: null,
  location: null,
  website: null,
  source_url: null,
  verification_notes: null,
  licence_verified: null,
  status: "Not contacted",
  next_action: null,
  last_contacted: null,
  notes: null,
  ...over,
});

describe("parseStreams", () => {
  it("maps every stream-fit value in the research CSV", () => {
    expect(parseStreams("Core investor")).toEqual(["core"]);
    expect(parseStreams("Springboard / Core investor")).toEqual(["core", "springboard"]);
    expect(parseStreams("Core investor / SMSF / multi-tenancy")).toEqual(["core", "smsf", "multi"]);
    expect(parseStreams("SMSF / SDA")).toEqual(["smsf", "sda"]);
    expect(parseStreams("Multi-tenancy")).toEqual(["multi"]);
    expect(parseStreams("Springboard")).toEqual(["springboard"]);
    expect(parseStreams(null)).toEqual([]);
  });
});

describe("niceCount", () => {
  it("rounds DOWN, coarsely, so the figure stays true as stock sells", () => {
    expect(niceCount(1628)).toBe("1,500+");
    expect(niceCount(291)).toBe("250+");
    expect(niceCount(162)).toBe("150+");
    expect(niceCount(47)).toBe("40+");
    expect(niceCount(12)).toBe("12");
    expect(niceCount(0)).toBe("0");
  });
  it("takes a coarser step for a count known to carry junk", () => {
    expect(niceCount(152, 100)).toBe("100+");
  });
});

describe("stockSentence", () => {
  it("carries an as-at date (Brisbane) and 'current', never 'available'", () => {
    const s = stockSentence(stats)!;
    expect(s).toContain("As at 11 September 2026");
    expect(s).toContain("1,500+ current listings");
    expect(s).toContain("100+ builders and developers");
    expect(s).not.toMatch(/available/);
  });
  it("says nothing rather than quote a thin or missing feed", () => {
    expect(stockSentence(null)).toBeNull();
    expect(stockSentence({ ...stats, available: 40 })).toBeNull();
  });
});

describe("greetingName", () => {
  it("handles the shapes in the CSV", () => {
    expect(greetingName("Michael Grace")).toBe("Michael");
    expect(greetingName("Lisa Thomas / Tayla Thomas")).toBe("Lisa and Tayla");
    expect(greetingName("Deb / Minh")).toBe("Deb and Minh");
    expect(greetingName(null)).toBeNull();
  });
});

describe("buildPitchEmail", () => {
  it("holds the Springboard paragraph back until a clause 7 reference exists", () => {
    const p = partner({ nextkey_stream_fit: "Springboard / Core investor", channel_type: "Building broker" });
    const without = buildPitchEmail(p, stats, {});
    expect(without.includesSpringboard).toBe(false);
    expect(without.text).not.toContain("Community Funding Program");
    expect(without.notes.join(" ")).toMatch(/clause 7/);

    const withRef = buildPitchEmail(p, stats, { springboardRef: "SBH-CP-TEST" });
    expect(withRef.includesSpringboard).toBe(true);
    expect(withRef.text).toContain(SPRINGBOARD_PARAGRAPH);
  });

  it("never puts Springboard in the same email as SMSF", () => {
    const p = partner({ nextkey_stream_fit: "Springboard / SMSF" });
    const e = buildPitchEmail(p, stats, { springboardRef: "SBH-CP-TEST" });
    expect(e.includesSpringboard).toBe(false);
    expect(e.text).not.toContain("Community Funding");
  });

  it("gives SMSF firms the LRBA-ban paragraph only under its OWN clause 7 reference", () => {
    const p = partner({ nextkey_stream_fit: "SMSF", channel_type: "SMSF specialist" });
    const held = buildPitchEmail(p, stats, { springboardRef: "SBH-CP-TEST" }); // Springboard approval is not enough
    expect(held.includesSmsfYla).toBe(false);
    expect(held.text).not.toContain(SMSF_YLA_PARAGRAPH);
    expect(held.notes.join(" ")).toMatch(/its own clause 7 approval/);

    const approved = buildPitchEmail(p, stats, { smsfRef: "SBH-CP-SMSF-TEST" });
    expect(approved.includesSmsfYla).toBe(true);
    expect(approved.text).toContain(SMSF_YLA_PARAGRAPH);
    expect(approved.text).not.toContain(SPRINGBOARD_PARAGRAPH);
  });

  it("never offers the LRBA-ban paragraph to a firm that isn't SMSF-stream", () => {
    const e = buildPitchEmail(partner({ nextkey_stream_fit: "Core investor" }), stats, { smsfRef: "X" });
    expect(e.includesSmsfYla).toBe(false);
  });

  it("the LRBA-ban wording keeps its guard rails", () => {
    for (const s of [SMSF_YLA_PARAGRAPH, SMSF_YLA_SCRIPT_LINE]) {
      expect(s).toMatch(/own name/);
      expect(s).toMatch(/personal purchase, not an SMSF/);
      expect(s).toMatch(/separate deposit loan/);
      expect(s).toMatch(/fees apply/);
      // Denial-only framing was the half-truth the review flagged; "still want to buy" sells it as a replacement.
      expect(s).not.toMatch(/still want to buy|no interest in the property/i);
      // Sean, 2026-09-12: "super may be relevant to eligibility cannot be said" — the copy must never
      // tie a client's super to qualifying, however YLA words it. Saying WHO advises on super is fine
      // ("any advice about super comes from a licensed adviser"); linking it to eligibility is not.
      for (const banned of [
        /super(annuation)?[^.]{0,60}\brelevan[ct][^.]{0,30}eligib/i,
        /super(annuation)?[^.]{0,60}\b(qualif|unlock|enabl)/i,
        /\b(qualif|eligib)[^.]{0,60}\b(their|your|a client's|the client's)\s+super/i,
      ]) {
        expect(s).not.toMatch(banned);
      }
      expect(s).not.toMatch(/workaround|loophole|get around|invest(s|ed|ment)? (into|in) the|lend(s|ing)? (to|money)|return|%/i);
    }
    expect(SMSF_YLA_PARAGRAPH).toContain("raised by Australians helping Australians buy property");
    expect(SMSF_YLA_PARAGRAPH).toContain("Eligibility depends on a number of factors");
  });

  it("the approved Springboard wording never mentions super or a referral fee", () => {
    expect(SPRINGBOARD_PARAGRAPH).toContain("raised by Australians helping Australians buy property");
    expect(SPRINGBOARD_PARAGRAPH).toContain("completed homes only");
    expect(SPRINGBOARD_PARAGRAPH).toContain("Eligibility depends on a number of factors");
    expect(SPRINGBOARD_PARAGRAPH).not.toMatch(/super|smsf|fee|community fund\b/i);
  });

  it("describes the LRBA ban accurately and makes no suitability call", () => {
    const e = buildPitchEmail(partner({ nextkey_stream_fit: "SMSF", channel_type: "SMSF specialist" }), stats);
    expect(e.subject).toBe("Single-contract stock for your SMSF buyers");
    expect(e.text).toContain("can't enter a new LRBA");
    expect(e.text).toContain("whether it suits a fund is for the trustee");
    expect(e.text).not.toMatch(/can no longer borrow|suits a cash purchase/);
  });

  it("never states yield, growth, rent or occupancy figures", () => {
    for (const fit of ["Core investor", "SDA", "Multi-tenancy", "SMSF / SDA"]) {
      const e = buildPitchEmail(partner({ nextkey_stream_fit: fit }), stats);
      expect(e.text).not.toMatch(/\d+(\.\d+)?\s?%|per week|\$\d/i);
    }
  });

  it("drops the figures, not the email, when the feed is unavailable", () => {
    const e = buildPitchEmail(partner({}), null);
    expect(e.text).not.toContain("As at");
    expect(e.notes.join(" ")).toMatch(/figures unavailable/);
  });

  it("always carries the disclaimer + unsubscribe line", () => {
    const e = buildPitchEmail(partner({}), stats);
    expect(e.text).toMatch(/General information only/);
    expect(e.text).toMatch(/reply "unsubscribe"/);
  });
});

describe("pitchTextToHtml", () => {
  it("renders exactly the (edited) text: lists, headings, small print, escaped", () => {
    const html = pitchTextToHtml(
      "Hi <Tim>,\n\nWhat that means:\n• Bold lead. Rest of line.\n• Second.\n\nGeneral information only. Test.",
    );
    expect(html).toContain("Hi &lt;Tim&gt;,");
    expect(html).toContain("<strong");
    expect(html).toContain("Bold lead.</strong> Rest of line.");
    expect(html).toContain("font-weight:bold;color:#1b1f44\">What that means:");
    expect(html).toMatch(/font-size:11px[^>]*>General information only/);
    expect(html).not.toContain("<Tim>");
  });
});

describe("buildCallScript", () => {
  it("keeps the same limits as the email", () => {
    const lines = buildCallScript(partner({ nextkey_stream_fit: "Springboard / Core investor", contact_name: "Tim Gold" }), stats, {});
    expect(lines[0]).toContain("Could I speak with Tim?");
    expect(lines.join(" ")).not.toContain("Community Funding"); // no ref → no Springboard line
    expect(lines[lines.length - 1]).toMatch(/^Never say:/);
  });
});

describe("coercePartnerBody", () => {
  it("rejects unknown statuses, bad emails and bad dates rather than storing them", () => {
    const r = coercePartnerBody({ status: "Hot lead", email: "not-an-email", last_contacted: "12/09/2026", company: "  X  " }, false);
    expect(r.status).toBe("Not contacted");
    expect(r.email).toBeNull();
    expect(r.last_contacted).toBeNull();
    expect(r.company).toBe("X");
  });
  it("only touches fields that were sent on PATCH", () => {
    expect(Object.keys(coercePartnerBody({ notes: "hi" }, false))).toEqual(["notes"]);
  });
  it("ignores fields outside the allow-list", () => {
    expect(coercePartnerBody({ id: "evil", contact_verified_at: "2020-01-01" }, false)).toEqual({});
  });
});

describe("summarisePartners", () => {
  it("counts streams, reachability and enrichment", () => {
    const s = summarisePartners([
      partner({ nextkey_stream_fit: "SMSF / SDA", email: "a@b.com.au" }),
      partner({ nextkey_stream_fit: "Core investor", verification_notes: "Contact details not captured - enrich" }),
    ]);
    expect(s.byStream.smsf).toBe(1);
    expect(s.byStream.core).toBe(1);
    expect(s.reachable).toBe(1);
    expect(s.enrich).toBe(1);
  });
});
