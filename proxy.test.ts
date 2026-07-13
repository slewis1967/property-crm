import { describe, it, expect } from "vitest";
import { isPublicSignRoute } from "./proxy";

describe("isPublicSignRoute", () => {
  it("exempts the public signer page and its token", () => {
    expect(isPublicSignRoute("/sign")).toBe(true);
    expect(isPublicSignRoute("/sign/abc")).toBe(true);
    expect(isPublicSignRoute("/sign/abc123-def")).toBe(true);
  });

  it("exempts the public token APIs", () => {
    expect(isPublicSignRoute("/api/sign/tok")).toBe(true);
    expect(isPublicSignRoute("/api/sign/tok/complete")).toBe(true);
    expect(isPublicSignRoute("/api/sign/tok/preview")).toBe(true);
    expect(isPublicSignRoute("/api/sign/tok/decline")).toBe(true);
    expect(isPublicSignRoute("/api/sign/tok/signed")).toBe(true);
  });

  it("does NOT exempt the authed advisor signature-requests routes", () => {
    // These moved OUT from under /api/sign/ to /api/signature-requests so the
    // Cloudflare Access bypass on /api/sign/* no longer strips their auth header.
    expect(isPublicSignRoute("/api/signature-requests")).toBe(false);
    expect(isPublicSignRoute("/api/signature-requests/123/download")).toBe(false);
  });

  it("does NOT exempt unrelated routes", () => {
    expect(isPublicSignRoute("/")).toBe(false);
    expect(isPublicSignRoute("/api/fact-finds")).toBe(false);
    expect(isPublicSignRoute("/properties")).toBe(false);
  });

  it("does not let the /sign prefix leak onto lookalike paths", () => {
    // "/signup" must not be treated as a signing route — the exact "/sign"
    // check plus the "/sign/" (trailing-slash) prefix prevent it.
    expect(isPublicSignRoute("/signup")).toBe(false);
    expect(isPublicSignRoute("/signature")).toBe(false);
    // Likewise "/api/sign" (no trailing slash / token) is not a token API.
    expect(isPublicSignRoute("/api/sign")).toBe(false);
    expect(isPublicSignRoute("/api/signatures")).toBe(false);
  });
});
