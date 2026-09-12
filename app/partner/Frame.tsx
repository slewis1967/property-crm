import PortalShell, { type NavItem } from "./PortalShell";
import { has } from "./session";
import type { PartnerIdentity } from "../../utils/partner-auth";

/** Server wrapper: builds the nav from what the firm's plan includes. */
export default function Frame({ identity, children }: { identity: PartnerIdentity; children: React.ReactNode }) {
  const nav: NavItem[] = [];
  if (has(identity, "stock")) nav.push({ href: "/partner/stock", label: "Stock" });
  if (has(identity, "clients")) nav.push({ href: "/partner/clients", label: "Clients" });
  if (has(identity, "deals")) nav.push({ href: "/partner/deals", label: "Deals" });
  nav.push({ href: "/partner/account", label: "Plan" });

  return (
    <PortalShell branding={identity.branding} firmName={identity.firmName} userName={identity.fullName} nav={nav}>
      {children}
    </PortalShell>
  );
}
