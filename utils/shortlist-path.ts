/**
 * Is this the PUBLIC client shortlist page? Used by AppShell and PublicRouteGate
 * to render it with no staff chrome.
 *
 * Its own tiny module on purpose: AppShell is in every page's bundle, and the
 * shortlist rules module pulls in the finance engine.
 *
 * Trailing slash load-bearing, as in proxy.ts isPublicShortlistRoute:
 * "/shortlists".startsWith("/shortlist") is true, and the staff page lives at
 * /property-shortlists.
 */
export function isShortlistPortalPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/shortlist" || pathname.startsWith("/shortlist/");
}
