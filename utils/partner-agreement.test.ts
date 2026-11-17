import { describe, expect, it } from "vitest";
import {
  PARTNER_AGREEMENT_VERSION,
  agreementBlocks,
  agreementIsCurrent,
  boldSegments,
  formatAbn,
  isValidAbn,
  normaliseAbn,
  parseAcceptance,
  renderAgreement,
  unfilledBlanks,
} from "./partner-agreement";
import { PARTNER_AGREEMENT_TEMPLATE } from "./partner-agreement-text";

// NextKey Pty Ltd's own ABN: a known-good checksum.
const GOOD_ABN = "28689818264";

const goodBody = {
  version: PARTNER_AGREEMENT_VERSION,
  signerName: "Jane Citizen",
  signerTitle: "Director",
  entityName: "Example Advisory Pty Ltd",
  abn: "28 689 818 264",
  readAgreement: true,
  hasAuthority: true,
};

describe("agreementIsCurrent (the portal gate)", () => {
  it("opens only for the current version with a signed date", () => {
    expect(agreementIsCurrent(PARTNER_AGREEMENT_VERSION, "2026-11-17T00:00:00Z")).toBe(true);
    expect(agreementIsCurrent(PARTNER_AGREEMENT_VERSION, null)).toBe(false);
    expect(agreementIsCurrent(PARTNER_AGREEMENT_VERSION, "")).toBe(false);
    expect(agreementIsCurrent("v0.9", "2026-11-17T00:00:00Z")).toBe(false);
    expect(agreementIsCurrent(null, "2026-11-17T00:00:00Z")).toBe(false);
    expect(agreementIsCurrent("signed on paper", "2026-11-17T00:00:00Z")).toBe(false);
  });
});

describe("ABN", () => {
  it("accepts a valid ABN with or without spaces", () => {
    expect(isValidAbn(GOOD_ABN)).toBe(true);
    expect(isValidAbn("28 689 818 264")).toBe(true);
    expect(normaliseAbn("28 689 818 264")).toBe(GOOD_ABN);
    expect(formatAbn(GOOD_ABN)).toBe("28 689 818 264");
  });
  it("rejects a bad checksum, wrong length or non-digits", () => {
    expect(isValidAbn("28689818265")).toBe(false);
    expect(isValidAbn("2868981826")).toBe(false);
    expect(isValidAbn("2868981826a")).toBe(false);
    expect(isValidAbn(28689818264)).toBe(false);
  });
});

describe("renderAgreement", () => {
  it("leaves no blank once every particular is supplied", () => {
    const text = renderAgreement({ entityName: "Example Advisory Pty Ltd", abn: GOOD_ABN, noticeEmail: "jane@example.com", tier: "professional", whiteLabel: false });
    expect(unfilledBlanks(text)).toEqual([]);
    expect(text).toContain("**Partner**: Example Advisory Pty Ltd ABN 28 689 818 264");
    expect(text).toContain("| Partner legal entity / ABN | Example Advisory Pty Ltd, ABN 28 689 818 264 |");
    expect(text).toContain("| Notice email (Partner) | jane@example.com |");
    expect(text).toContain("| Tier | Professional |");
    expect(text).toContain("| White-label | No.");
  });
  it("the preview says what is still to be entered", () => {
    const text = renderAgreement({ entityName: null, abn: null, noticeEmail: "jane@example.com", tier: "basic", whiteLabel: false });
    expect(unfilledBlanks(text)).toContain("(entered when you accept)");
  });
  it("an unknown tier reads as Basic, never wider", () => {
    const text = renderAgreement({ entityName: "X Pty Ltd", abn: GOOD_ABN, noticeEmail: "a@b.co", tier: "platinum", whiteLabel: false });
    expect(text).toContain("| Tier | Basic |");
  });
  it("every placeholder the renderer replaces still exists in the template", () => {
    // If someone edits the template text, the fill-in must not silently stop matching.
    for (const s of [
      "**Partner**: [Partner legal entity] ABN [ ]",
      "| Partner legal entity / ABN | [ ] |",
      "| Notice email (Partner) | [ ] |",
      "| Tier | Basic / Professional / Enterprise |",
      "| White-label | Yes / No. Configured by NextKey on request; Enterprise tier only |",
    ]) expect(PARTNER_AGREEMENT_TEMPLATE).toContain(s);
  });
});

describe("the approved v1.0 text", () => {
  it("carries Sean's 17 Nov decisions and no draft markers", () => {
    const t = PARTNER_AGREEMENT_TEMPLATE;
    expect(t).toContain("Suite 186/52 Currumbin Creek Road");
    expect(t).toContain("for **18 months** after it ends");
    expect(t).toContain("NextKey pays 100% of the Referral Fee within 14 days after NextKey receives the Gross");
    expect(t).toContain("glenn.m@nextkey.com.au");
    expect(t).toContain("## Execution");
    expect(t).not.toMatch(/\[SEAN|solicitor|DRAFT/i);
    expect(t).not.toMatch(/sean\.l@|0488|Springboard|Your Loan Assist/);
  });
});

describe("parseAcceptance", () => {
  it("accepts a complete submission and normalises the ABN", () => {
    const r = parseAcceptance(goodBody);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.abn).toBe(GOOD_ABN);
  });
  it("refuses a page loaded under another version", () => {
    expect(parseAcceptance({ ...goodBody, version: "v0.9" }).ok).toBe(false);
  });
  it("requires both ticks to be literally true", () => {
    expect(parseAcceptance({ ...goodBody, readAgreement: "true" }).ok).toBe(false);
    expect(parseAcceptance({ ...goodBody, hasAuthority: false }).ok).toBe(false);
  });
  it("requires name, position, entity and a valid ABN", () => {
    expect(parseAcceptance({ ...goodBody, signerName: " " }).ok).toBe(false);
    expect(parseAcceptance({ ...goodBody, signerTitle: "" }).ok).toBe(false);
    expect(parseAcceptance({ ...goodBody, entityName: "x" }).ok).toBe(false);
    expect(parseAcceptance({ ...goodBody, abn: "12345678901" }).ok).toBe(false);
  });
});

describe("display helpers", () => {
  it("splits headings, tables, rules and paragraphs", () => {
    const kinds = agreementBlocks(PARTNER_AGREEMENT_TEMPLATE).map((b) => b.kind);
    expect(kinds[0]).toBe("h1");
    expect(kinds).toContain("table");
    expect(kinds).toContain("hr");
    const sched = agreementBlocks(PARTNER_AGREEMENT_TEMPLATE).find((b) => b.kind === "table");
    expect(sched && sched.kind === "table" ? sched.header : []).toEqual(["Item", "Value"]);
  });
  it("bold segments", () => {
    expect(boldSegments("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
  });
});
