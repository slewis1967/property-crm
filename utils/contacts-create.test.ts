import { describe, it, expect } from "vitest";
import {
  contactRecord,
  firstNameOf,
  looksLikeEmail,
  normaliseEmail,
} from "./contacts-create";

const NOW = "2026-08-13T00:00:00.000Z";

describe("normaliseEmail", () => {
  it("lowercases and trims", () => {
    expect(normaliseEmail("  Sean.L@NextKey.com.AU ")).toBe("sean.l@nextkey.com.au");
  });

  it.each([null, undefined, "", "   "])("treats %p as absent", (v) => {
    expect(normaliseEmail(v)).toBeNull();
  });
});

describe("looksLikeEmail", () => {
  it.each(["a@b.co", "sean.l@nextkey.com.au", "first+tag@sub.domain.org"])(
    "accepts %s",
    (e) => expect(looksLikeEmail(e)).toBe(true),
  );

  it.each(["", "nope", "no@domain", "no.at.sign.com", "two @spaces.com", null])(
    "rejects %p",
    (e) => expect(looksLikeEmail(e)).toBe(false),
  );

  it("accepts an address that is unusual but valid — refusing one mid-call is the worse failure", () => {
    expect(looksLikeEmail("o'brien_1@my-domain.com.au")).toBe(true);
  });
});

describe("firstNameOf", () => {
  it("takes the first word", () => {
    expect(firstNameOf("Munish Lubana")).toBe("Munish");
  });

  it("collapses stray whitespace rather than returning an empty string", () => {
    expect(firstNameOf("   Sean   Lewis ")).toBe("Sean");
  });

  it.each([null, undefined, "", "  "])("returns null for %p", (v) => {
    expect(firstNameOf(v)).toBeNull();
  });
});

describe("contactRecord", () => {
  it("mirrors preferred_state into state, as the bulk importer does", () => {
    const r = contactRecord({ full_name: "A B", email: "a@b.co", preferred_state: "QLD" }, NOW);
    expect(r.preferred_state).toBe("QLD");
    expect(r.state).toBe("QLD");
  });

  it("fills name and full_name identically and derives first_name", () => {
    const r = contactRecord({ full_name: "Munish Lubana", email: "m@x.co" }, NOW);
    expect(r.full_name).toBe("Munish Lubana");
    expect(r.name).toBe("Munish Lubana");
    expect(r.first_name).toBe("Munish");
  });

  it("defaults source/status/temperature so a manual contact isn't distinguishable from an imported one", () => {
    const r = contactRecord({ full_name: "A", email: "a@b.co" }, NOW);
    expect(r.source).toBe("crm_manual");
    expect(r.status).toBe("new");
    expect(r.temperature).toBe("warm");
  });

  it("lets the caller override the defaults", () => {
    const r = contactRecord(
      { full_name: "A", email: "a@b.co", source: "self_book", temperature: "hot", status: "open" },
      NOW,
    );
    expect(r.source).toBe("self_book");
    expect(r.temperature).toBe("hot");
    expect(r.status).toBe("open");
  });

  it("normalises the email it stores", () => {
    const r = contactRecord({ full_name: "A", email: " A@B.CO " }, NOW);
    expect(r.email).toBe("a@b.co");
  });

  it("stores blank optional fields as null, never as empty strings", () => {
    const r = contactRecord({ full_name: "A", email: "a@b.co", phone: "   " }, NOW);
    expect(r.phone).toBeNull();
    expect(r.buyer_type).toBeNull();
    expect(r.budget_max).toBeNull();
  });

  it("stamps both timestamps from the supplied clock", () => {
    const r = contactRecord({ full_name: "A", email: "a@b.co" }, NOW);
    expect(r.created_at).toBe(NOW);
    expect(r.updated_at).toBe(NOW);
  });
});
