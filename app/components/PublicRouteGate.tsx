"use client";

/**
 * Renders its children on normal CRM routes but nothing on the public,
 * standalone pages — used to keep app chrome (the voice assistant) off external
 * pages without touching the wrapped component.
 *
 * The introducer portal is here for the same reason as `/sign`: it is used by
 * people outside the business, and internal tooling has no business appearing
 * there. Trailing slash matters — "/introducers" is a staff path.
 */
import { usePathname } from "next/navigation";
import { isPartnerPortalPath } from "../../utils/partner";
import { isShortlistPortalPath } from "../../utils/shortlist-path";

export default function PublicRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/sign" || pathname?.startsWith("/sign/")) return null;
  if (pathname === "/introducer" || pathname?.startsWith("/introducer/")) return null;
  // Channel-partner portal, same reason. "/partners" is not a match.
  if (isPartnerPortalPath(pathname)) return null;
  // Client property shortlist, same reason. "/shortlists" is not a match.
  if (isShortlistPortalPath(pathname)) return null;
  return <>{children}</>;
}
