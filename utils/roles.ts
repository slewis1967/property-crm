/**
 * CRM roles — who may see what.
 *
 * Everyone behind Cloudflare Access used to see the whole CRM. That is fine
 * for staff, but not for an outside marketer: contacts, fact finds (DOB,
 * licence, income), deals, commissions and the inbox are client PII or
 * commercially sensitive. A "marketing" user gets a short allowlist instead.
 *
 * The allowlist is DENY BY DEFAULT and is enforced at the edge in proxy.ts,
 * before any page or API route runs. Hiding nav links (Sidebar) is cosmetic;
 * the proxy check is the security boundary. A new page or API route is closed
 * to marketing users until someone adds it here on purpose.
 *
 * Adding a marketing user: add the address to MARKETING_EMAILS AND to the
 * Cloudflare Access policy on the "NextKey CRM" app. Both are needed: Access
 * lets them in, this file decides what they see once in. Anyone in the Access
 * policy who is NOT listed here is treated as full staff.
 */

export type CrmRole = "staff" | "marketing";

export const MARKETING_EMAILS: ReadonlySet<string> = new Set([
  "chris@regathered.com.au", // Chris — marketing (Regathered), added 9 Nov 2026
]);

/** Where a marketing user lands, and where blocked pages send them. */
export const MARKETING_HOME = "/analytics";

/** Pages a marketing user may open. Exact paths only — no subtrees, so
 *  /properties/[id] (developer fees + client matches) stays closed. */
export const MARKETING_PAGES: readonly string[] = [
  "/analytics",      // aggregate lead / SMS / stock counts, no names
  "/social",         // social post history
  "/properties",     // stock feed
  "/properties/map", // stock map
  "/suburbs",        // suburb intelligence
];

/** API routes a marketing user may call, with the methods allowed on each. */
const MARKETING_API: Readonly<Record<string, readonly string[]>> = {
  "/api/properties/list": ["GET", "HEAD"],
  "/api/properties/map": ["GET", "HEAD"],
  "/api/ai/suburb-brief": ["POST"],
};

const READ_METHODS = new Set(["GET", "HEAD"]);

export function roleForEmail(email: string | null | undefined): CrmRole {
  if (!email) return "staff";
  return MARKETING_EMAILS.has(email.trim().toLowerCase()) ? "marketing" : "staff";
}

/** Normalise a trailing slash so "/social/" matches "/social". */
function norm(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** Brand/PWA files in /public the app chrome loads. An explicit list, not a
 *  pattern: a file-extension test would also let through a dynamic page route
 *  whose last segment merely looks like a file (/contacts/x.json). The help
 *  videos in /public/help describe internal screens and stay staff-only. */
const PUBLIC_ASSETS: ReadonlySet<string> = new Set([
  "/manifest.json",
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/favicon-96x96.png",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/logo.png",
]);

function isPublicAsset(pathname: string): boolean {
  return PUBLIC_ASSETS.has(pathname);
}

export function isMarketingPage(pathname: string): boolean {
  return MARKETING_PAGES.includes(norm(pathname));
}

/**
 * May a marketing user make this request? Deny by default.
 */
export function marketingMayAccess(pathname: string, method: string): boolean {
  const p = norm(pathname);
  const m = method.toUpperCase();
  if (p.startsWith("/api/")) {
    return MARKETING_API[p]?.includes(m) ?? false;
  }
  if (!READ_METHODS.has(m)) return false; // no server actions on pages
  if (isPublicAsset(p)) return true;
  return isMarketingPage(p);
}
