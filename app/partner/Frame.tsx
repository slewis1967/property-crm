import PortalShell, { type NavItem } from "./PortalShell";
import { has } from "./session";
import type { PartnerIdentity } from "../../utils/partner-auth";

/**
 * Server wrapper: builds the nav from what the firm's plan includes.
 * `locked` (the agreement page before acceptance) shows no feature links,
 * since every one of them would only bounce back to the agreement.
 */
export default function Frame({
  identity,
  locked = false,
  children,
}: {
  identity: PartnerIdentity;
  locked?: boolean;
  children: React.ReactNode;
}) {
  const nav: NavItem[] = [];
  if (!locked) {
    if (has(identity, "stock")) nav.push({ href: "/partner/stock", label: "Stock", icon: "grid" });
    if (has(identity, "stock")) nav.push({ href: "/partner/map", label: "Map", icon: "map" });
    if (has(identity, "clients")) nav.push({ href: "/partner/clients", label: "Clients", icon: "users" });
    if (has(identity, "deals")) nav.push({ href: "/partner/deals", label: "Deals", icon: "handshake" });
    if (has(identity, "suburb_reports")) nav.push({ href: "/partner/suburbs", label: "Suburbs", icon: "pin" });
    if (has(identity, "feasibility")) nav.push({ href: "/partner/feasibility", label: "Feasibility", icon: "layers" });
    nav.push({ href: "/partner/account", label: "Plan", icon: "star" });
  }
  nav.push({ href: "/partner/agreement", label: "Agreement", icon: "doc" });

  return (
    <PortalShell branding={identity.branding} firmName={identity.firmName} userName={identity.fullName} nav={nav}>
      {children}
    </PortalShell>
  );
}
