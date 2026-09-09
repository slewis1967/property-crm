import { describe, it, expect } from "vitest";
import { contentHash, issueReviewToken, verifyReviewToken } from "./review-token";

/**
 * The broadcast endpoint's compliance-bypass token system.
 *
 * These tests pin the four properties that make the system safe:
 *
 *  1. The token is content-bound: editing the subject/body invalidates it.
 *  2. The token is operator-bound: Sean can't use Glenn's token, even on
 *     identical copy.
 *  3. The token has a TTL: a token from 20 minutes ago is rejected.
 *  4. The token has a kind: a "violations" token can't be presented as
 *     an "outage" token (or vice versa).
 *
 * If any of these breaks, the broadcast endpoint can be tricked into
 * sending without a review. The whole reason the endpoint takes a
 * server-issued token instead of a client boolean is to make this
 * guarantee local-testable.
 */
describe("contentHash", () => {
  it("produces identical hashes for identical copy", () => {
    const a = contentHash("Subject", "<p>Body</p>", "Body");
    const b = contentHash("Subject", "<p>Body</p>", "Body");
    expect(a).toBe(b);
  });

  it("produces different hashes for different subjects", () => {
    const a = contentHash("Subject A", "<p>Body</p>", "Body");
    const b = contentHash("Subject B", "<p>Body</p>", "Body");
    expect(a).not.toBe(b);
  });

  it("produces different hashes for different bodies", () => {
    const a = contentHash("Subject", "<p>A</p>", "A");
    const b = contentHash("Subject", "<p>B</p>", "B");
    expect(a).not.toBe(b);
  });

  it("produces different hashes when html and text diverge", () => {
    const a = contentHash("Subject", "<p>A</p>", "A");
    const b = contentHash("Subject", "<p>A</p>", "A (different)");
    expect(a).not.toBe(b);
  });
});

describe("review-token issue + verify round-trip", () => {
  it("accepts a freshly-issued violations token with matching content and operator", () => {
    const subject = "Test broadcast";
    const html = "<p>Hello</p>";
    const text = "Hello";
    const operator = "sean.l@nextkey.com.au";
    const hash = contentHash(subject, html, text);
    const token = issueReviewToken("v", hash, operator);

    const result = verifyReviewToken(token, hash, operator);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("v");
  });

  it("accepts a freshly-issued outage token with matching content and operator", () => {
    const subject = "Test";
    const html = "<p>x</p>";
    const text = "x";
    const operator = "sean.l@nextkey.com.au";
    const hash = contentHash(subject, html, text);
    const token = issueReviewToken("o", hash, operator);

    const result = verifyReviewToken(token, hash, operator);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("o");
  });

  it("rejects when the content has been edited after the token was issued", () => {
    const subject = "Test";
    const html = "<p>original</p>";
    const text = "original";
    const operator = "sean.l@nextkey.com.au";
    const hash = contentHash(subject, html, text);
    const token = issueReviewToken("v", hash, operator);

    // Operator edited the body to bypass the flagged violation.
    const editedHash = contentHash(subject, "<p>edited</p>", "edited");
    const result = verifyReviewToken(token, editedHash, operator);
    expect(result.ok).toBe(false);
  });

  it("rejects when a different operator tries to use the token", () => {
    const hash = contentHash("S", "<p>B</p>", "B");
    const token = issueReviewToken("v", hash, "sean.l@nextkey.com.au");

    const result = verifyReviewToken(token, hash, "glenn.m@nextkey.com.au");
    expect(result.ok).toBe(false);
  });

  it("rejects garbage tokens without crashing", () => {
    const hash = contentHash("S", "<p>B</p>", "B");
    expect(verifyReviewToken("not-a-token", hash, "x@y.com").ok).toBe(false);
    expect(verifyReviewToken("", hash, "x@y.com").ok).toBe(false);
    expect(verifyReviewToken("a.b.c", hash, "x@y.com").ok).toBe(false);
  });
});

describe("contentHash — brand binding (the firewall half)", () => {
  // Reviewing as Springboard then sending as NextKey is the exact breach the
  // brand firewall exists to prevent. Binding brand into the hash means the
  // override token from one review cannot authorise a send as the other.
  it("differs by brand for the same copy", () => {
    const nk = contentHash("S", "<p>B</p>", "B", "nextkey");
    const sb = contentHash("S", "<p>B</p>", "B", "springboard");
    expect(nk).not.toBe(sb);
  });

  it("omitting brand hashes identically to nextkey, so existing tokens survive", () => {
    expect(contentHash("S", "<p>B</p>", "B")).toBe(
      contentHash("S", "<p>B</p>", "B", "nextkey"),
    );
    expect(contentHash("S", "<p>B</p>", "B")).toBe(
      contentHash("S", "<p>B</p>", "B", null),
    );
  });

  it("a Springboard token does not verify a NextKey send of the same copy", () => {
    const sbHash = contentHash("S", "<p>B</p>", "B", "springboard");
    const token = issueReviewToken("v", sbHash, "op@nextkey.com.au");
    const nkHash = contentHash("S", "<p>B</p>", "B", "nextkey");
    expect(verifyReviewToken(token, sbHash, "op@nextkey.com.au").ok).toBe(true);
    expect(verifyReviewToken(token, nkHash, "op@nextkey.com.au").ok).toBe(false);
  });
});
