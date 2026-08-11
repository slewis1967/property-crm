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

export default function PublicRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/sign" || pathname?.startsWith("/sign/")) return null;
  if (pathname === "/introducer" || pathname?.startsWith("/introducer/")) return null;
  return <>{children}</>;
}
