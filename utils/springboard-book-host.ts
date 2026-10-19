/**
 * book.springboardhomes.com.au — the Springboard self-book page on its own
 * hostname, so a Springboard lead never sees a nextkey.com.au URL.
 *
 * THIS HOST IS NOT BEHIND CLOUDFLARE ACCESS. It is a Netlify domain alias of
 * the same site that serves crm.nextkey.com.au, CNAMEd straight at Netlify. So
 * on this host the app exposes an explicit allow-list (below) and 404s
 * everything else. It never redirects to the CRM and never falls through to the
 * CF Access gate: anything not on the list simply does not exist here.
 *
 * Pure (no Next imports) so proxy.ts, the page and the booking API share one
 * definition, and so it can be tested without a request.
 */

export const SPRINGBOARD_BOOK_HOST = "book.springboardhomes.com.au";
export const SPRINGBOARD_BOOK_ORIGIN = `https://${SPRINGBOARD_BOOK_HOST}`;
/** The one booking host this hostname serves (utils/scheduling-hosts.ts slug). */
export const SPRINGBOARD_BOOK_SLUG = "springboard";

/**
 * Request header proxy.ts sets to "1" on this host (and to "0" everywhere
 * else, after deleting any client-supplied copy), so server components can
 * tell which host they are rendering for without trusting the request.
 */
export const BOOK_HOST_HEADER = "x-springboard-book-host";

const PAGE_PATH = `/book/${SPRINGBOARD_BOOK_SLUG}`;
const API_PATH = `/api/book/${SPRINGBOARD_BOOK_SLUG}`;
/** Springboard square icon (app/api/book/[host]/icon). */
export const SPRINGBOARD_ICON_PATH = `${API_PATH}/icon`;

function normaliseHost(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d{1,5}$/, "")
    .replace(/\.$/, "");
}

/**
 * True if ANY of the given host values names the Springboard booking host.
 * Callers pass every host signal they have (URL hostname, Host, X-Forwarded-
 * Host). Matching on any of them only ever makes a request MORE restricted, so
 * a spoofed header can shrink what a caller sees, never widen it.
 */
export function isSpringboardBookHost(...hosts: Array<string | null | undefined>): boolean {
  return hosts.some((h) => normaliseHost(h) === SPRINGBOARD_BOOK_HOST);
}

export type BookHostDecision =
  /** Serve this path as-is. */
  | { kind: "pass" }
  /** Serve a different internal path under the same URL. */
  | { kind: "rewrite"; pathname: string }
  /** Answer with the host's own robots.txt. */
  | { kind: "robots" }
  /** Not part of the booking page: 404. */
  | { kind: "not_found" };

const READ = new Set(["GET", "HEAD"]);
const READ_WRITE = new Set(["GET", "HEAD", "POST"]);

/**
 * The allow-list. Each entry is an EXACT path (no prefixes, so nothing new can
 * appear on this host by being added under an allowed folder) with the methods
 * it accepts. `/_next/static/*` is the only prefix: hashed build assets.
 *
 *  /                          → rewritten to the booking page
 *  /book/springboard          the page itself
 *  /api/book/springboard      availability (GET) + booking (POST)
 *  /api/book/springboard/og   link-preview image
 *  /api/book/springboard/icon favicon / touch icon
 *  /api/portal/logo           the Springboard logo the page header loads
 *  /favicon.ico, /apple-touch-icon*.png → the Springboard icon (browsers ask
 *                             for these by name, whatever the HTML says)
 *  /robots.txt                answered by the proxy (springboardBookRobots)
 *  /join/<token>[/pa[/file]]  the lead's guest video call (see joinMethods)
 *  /api/livekit/guest-token   POST: redeem the guest link for a LiveKit token
 */
const EXACT: Record<string, Set<string>> = {
  [PAGE_PATH]: READ,
  [API_PATH]: READ_WRITE,
  [`${API_PATH}/og`]: READ,
  [SPRINGBOARD_ICON_PATH]: READ,
  "/api/portal/logo": READ,
  // Guest video join: JoinClient redeems its signed link token here for a
  // LiveKit join token. The exact path only — the authed /api/livekit/*
  // siblings (token, record, calls, guest-link, webhook) stay off this host.
  "/api/livekit/guest-token": new Set(["POST"]),
};

/**
 * The lead's guest video join (app/join/[token]): the page itself, plus the
 * two token-scoped routes its call screen polls when a consultant presents a
 * Preliminary Assessment (components/PaAudience.tsx). One token segment, no
 * deeper paths. The signed token is the credential; each handler verifies it.
 */
const JOIN_PAGE = /^\/join\/[^/]+$/;
const JOIN_PA = /^\/join\/[^/]+\/pa$/;
const JOIN_PA_FILE = /^\/join\/[^/]+\/pa\/file$/;

function joinMethods(pathname: string): Set<string> | undefined {
  if (JOIN_PAGE.test(pathname)) return READ;
  if (JOIN_PA.test(pathname)) return READ_WRITE;
  if (JOIN_PA_FILE.test(pathname)) return READ;
  return undefined;
}

const ICON_ALIASES = new Set([
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
]);

export function springboardBookRoute(pathname: string, method: string): BookHostDecision {
  const m = method.toUpperCase();
  if (pathname === "/") {
    return READ.has(m) ? { kind: "rewrite", pathname: PAGE_PATH } : { kind: "not_found" };
  }
  if (pathname === "/robots.txt") {
    return READ.has(m) ? { kind: "robots" } : { kind: "not_found" };
  }
  if (ICON_ALIASES.has(pathname)) {
    return READ.has(m) ? { kind: "rewrite", pathname: SPRINGBOARD_ICON_PATH } : { kind: "not_found" };
  }
  if (pathname.startsWith("/_next/static/")) {
    return READ.has(m) ? { kind: "pass" } : { kind: "not_found" };
  }
  const methods = EXACT[pathname] ?? joinMethods(pathname);
  if (methods && methods.has(m)) return { kind: "pass" };
  return { kind: "not_found" };
}

/**
 * robots.txt for this host: the booking page (and the images a link preview
 * needs) may be crawled, nothing else. Most-specific rule wins (RFC 9309), so
 * the Allow lines beat the blanket Disallow.
 */
export function springboardBookRobots(): string {
  return [
    "User-agent: *",
    "Allow: /$",
    `Allow: ${PAGE_PATH}$`,
    `Allow: ${API_PATH}/og$`,
    `Allow: ${SPRINGBOARD_ICON_PATH}$`,
    "Allow: /api/portal/logo$",
    "Disallow: /",
    "",
  ].join("\n");
}

/**
 * Origin to put in links that must open the CRM, not this host — the host's
 * staff room link (/video/…), which does not exist on the booking host. A
 * booking taken there must not mint it against that host. Everywhere else the
 * request's own origin is kept, exactly as before.
 */
export function crmLinkOrigin(requestOrigin: string, onBookHost: boolean): string {
  if (!onBookHost) return requestOrigin;
  const env = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  return (env || "https://crm.nextkey.com.au").replace(/\/+$/, "");
}

/**
 * Origin for the LEAD's guest join link (/join/<token>) on a self-booking.
 * Springboard leads get it on the Springboard booking host — in the
 * confirmation panel, the invite email and the .ics — whichever host the
 * booking came in on, so they never see a nextkey.com.au URL. NextKey hosts
 * keep the request origin, as before (they cannot be booked on the Springboard
 * host at all).
 */
export function guestJoinOrigin(brand: string, requestOrigin: string, onBookHost: boolean): string {
  if (brand === "springboard") return SPRINGBOARD_BOOK_ORIGIN;
  return crmLinkOrigin(requestOrigin, onBookHost);
}
