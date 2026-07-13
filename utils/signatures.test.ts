import { describe, it, expect } from "vitest";
import {
  isSignDocType,
  isTerminalStatus,
  isExpired,
  allSigned,
  buildSignaturesArray,
  formatSignedDate,
  type SignerLike,
} from "./signatures";

describe("isSignDocType", () => {
  it("accepts the three doc types", () => {
    expect(isSignDocType("fact_find")).toBe(true);
    expect(isSignDocType("needs_analysis")).toBe(true);
    expect(isSignDocType("credit_authorisation")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isSignDocType("other")).toBe(false);
    expect(isSignDocType("")).toBe(false);
    expect(isSignDocType(null)).toBe(false);
    expect(isSignDocType(42)).toBe(false);
  });
});

describe("isTerminalStatus", () => {
  it("true for signed / declined / expired", () => {
    expect(isTerminalStatus("signed")).toBe(true);
    expect(isTerminalStatus("declined")).toBe(true);
    expect(isTerminalStatus("expired")).toBe(true);
  });
  it("false for sent / viewed", () => {
    expect(isTerminalStatus("sent")).toBe(false);
    expect(isTerminalStatus("viewed")).toBe(false);
  });
});

describe("isExpired", () => {
  const now = Date.parse("2026-07-13T00:00:00Z");
  it("true when expires_at is in the past", () => {
    expect(isExpired("2026-07-12T00:00:00Z", now)).toBe(true);
  });
  it("false when in the future", () => {
    expect(isExpired("2026-07-20T00:00:00Z", now)).toBe(false);
  });
  it("false for null/empty/unparseable (never auto-expires)", () => {
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired(undefined, now)).toBe(false);
    expect(isExpired("", now)).toBe(false);
    expect(isExpired("not-a-date", now)).toBe(false);
  });
});

describe("allSigned", () => {
  const signed = (i: number): SignerLike => ({ signer_index: i, status: "signed" });
  it("true only when every row is signed", () => {
    expect(allSigned([signed(1), signed(2)])).toBe(true);
  });
  it("false when any row is unsigned", () => {
    expect(allSigned([signed(1), { signer_index: 2, status: "viewed" }])).toBe(false);
  });
  it("false for an empty list (nothing was requested)", () => {
    expect(allSigned([])).toBe(false);
  });
});

describe("buildSignaturesArray", () => {
  it("places each signer's mark at signer_index-1", () => {
    const rows: SignerLike[] = [
      { signer_index: 1, status: "signed", signature_image: "data:image/png;base64,AAA", signer_name: "Jane", signed_at: "2026-07-13T02:00:00Z" },
      { signer_index: 2, status: "signed", signature_image: "data:image/png;base64,BBB", signer_name: "John", signed_at: "2026-07-13T03:00:00Z" },
    ];
    const marks = buildSignaturesArray(rows);
    expect(marks[0]?.name).toBe("Jane");
    expect(marks[0]?.image).toContain("AAA");
    expect(marks[1]?.name).toBe("John");
  });

  it("skips unsigned rows and rows without an image", () => {
    const rows: SignerLike[] = [
      { signer_index: 1, status: "viewed", signature_image: "data:image/png;base64,AAA" },
      { signer_index: 2, status: "signed", signature_image: null },
    ];
    expect(buildSignaturesArray(rows).filter(Boolean)).toHaveLength(0);
  });

  it("ignores out-of-range indices without crashing", () => {
    const rows: SignerLike[] = [
      { signer_index: 0, status: "signed", signature_image: "x" },
      { signer_index: 99, status: "signed", signature_image: "x" },
    ];
    expect(buildSignaturesArray(rows).filter(Boolean)).toHaveLength(0);
  });
});

describe("formatSignedDate", () => {
  it("formats an ISO date to a short en-AU form", () => {
    expect(formatSignedDate("2026-07-13T02:00:00Z")).toMatch(/2026/);
  });
  it("passes through unparseable input", () => {
    expect(formatSignedDate("nope")).toBe("nope");
  });
});
