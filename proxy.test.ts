import { describe, it, expect } from "vitest";
import { isPublicSignRoute, isPublicGuestRoute, isPublicBookingRoute, isPublicPortalRoute } from "./proxy";

describe("isPublicGuestRoute", () => {
  it("exempts the guest-join page (bare + tokenised)", () => {
    expect(isPublicGuestRoute("/join")).toBe(true);
    expect(isPublicGuestRoute("/join/abc123.def.ghi")).toBe(true);
  });

  it("exempts ONLY the exact guest-token API", () => {
    expect(isPublicGuestRoute("/api/livekit/guest-token")).toBe(true);
  });

  it("does NOT exempt the authed sibling /api/livekit routes", () => {
    // These must keep their CF Access auth header — a broad /api/livekit/*
    // bypass would strip it (the trap the sign flow already documents).
    expect(isPublicGuestRoute("/api/livekit/token")).toBe(false);
    expect(isPublicGuestRoute("/api/livekit/record")).toBe(false);
    expect(isPublicGuestRoute("/api/livekit/calls")).toBe(false);
    expect(isPublicGuestRoute("/api/livekit/guest-link")).toBe(false);
    expect(isPublicGuestRoute("/api/livekit/webhook")).toBe(false);
  });

  it("does NOT exempt lookalikes", () => {
    expect(isPublicGuestRoute("/joined")).toBe(false);
    expect(isPublicGuestRoute("/api/livekit/guest-tokens")).toBe(false);
    expect(isPublicGuestRoute("/")).toBe(false);
  });
});

describe("isPublicBookingRoute", () => {
  it("exempts the self-book page (bare + host slug)", () => {
    expect(isPublicBookingRoute("/book")).toBe(true);
    expect(isPublicBookingRoute("/book/sean")).toBe(true);
    expect(isPublicBookingRoute("/book/springboard")).toBe(true);
  });

  it("exempts the booking API for any host", () => {
    expect(isPublicBookingRoute("/api/book/sean")).toBe(true);
    expect(isPublicBookingRoute("/api/book/glenn")).toBe(true);
  });

  it("does NOT exempt lookalikes or unrelated routes", () => {
    expect(isPublicBookingRoute("/booked")).toBe(false);
    expect(isPublicBookingRoute("/bookings")).toBe(false);
    expect(isPublicBookingRoute("/api/books")).toBe(false);
    expect(isPublicBookingRoute("/")).toBe(false);
  });
});

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

describe("isPublicPortalRoute", () => {
  it("exempts the client document portal page (bare + tokenised)", () => {
    expect(isPublicPortalRoute("/portal")).toBe(true);
    expect(isPublicPortalRoute("/portal/1IJ_wDiPtdmvzXVfRcCFEeQZ9mQ2S8kK3nHrLbY7pUo")).toBe(true);
  });

  it("exempts the token-scoped portal APIs", () => {
    expect(isPublicPortalRoute("/api/portal/abc123")).toBe(true);
    expect(isPublicPortalRoute("/api/portal/abc123/upload-url")).toBe(true);
  });

  it("does NOT exempt the rep-side document-request routes", () => {
    // These create and manage requests and MUST keep their CF Access auth
    // header. They live outside /api/portal/ precisely so this bypass cannot
    // strip it -- the same trap the sign flow hit with /api/sign/requests.
    expect(isPublicPortalRoute("/api/document-requests")).toBe(false);
    expect(isPublicPortalRoute("/api/document-requests/abc/export")).toBe(false);
  });

  it("does NOT exempt lookalikes", () => {
    expect(isPublicPortalRoute("/portalx")).toBe(false);
    expect(isPublicPortalRoute("/api/portalx/abc")).toBe(false);
    expect(isPublicPortalRoute("/api/portal")).toBe(false);
    expect(isPublicPortalRoute("/documents")).toBe(false);
  });
});
