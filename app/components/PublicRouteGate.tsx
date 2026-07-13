"use client";

/**
 * Renders its children on normal CRM routes but nothing on the public,
 * standalone `/sign/*` pages — used to keep app chrome (the voice assistant)
 * off the external e-signature page without touching the wrapped component.
 */
import { usePathname } from "next/navigation";

export default function PublicRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/sign" || pathname?.startsWith("/sign/")) return null;
  return <>{children}</>;
}
