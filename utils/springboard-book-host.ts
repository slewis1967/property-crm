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
 */
const EXACT: Record<string, Set<string>> = {
  [PAGE_PATH]: READ,
  [API_PATH]: READ_WRITE,
  [`${API_PATH}/og`]: READ,
  [SPRINGBOARD_ICON_PATH]: READ,
  "/api/portal/logo": READ,
};

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
  const methods = EXACT[pathname];
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
 * Origin to put in links that must open the CRM, not this host — the lead's
 * guest video link (/join/…) and the host's room link (/video/…). Neither path
 * exists on the booking host, so a booking taken there must not mint links
 * against it. Everywhere else the request's own origin is kept, exactly as
 * before.
 */
export function crmLinkOrigin(requestOrigin: string, onBookHost: boolean): string {
  if (!onBookHost) return requestOrigin;
  const env = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  return (env || "https://crm.nextkey.com.au").replace(/\/+$/, "");
}
