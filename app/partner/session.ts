/**
 * Server-side session resolution for the partner PAGES (not the API).
 *
 * Pages resolve the session before rendering anything, so a signed-out visitor
 * is redirected before any markup is produced — a page that renders first and
 * checks second leaks its shape.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession, sessionCookieName, type PartnerIdentity } from "../../utils/partner-auth";
import { canUse, type PartnerFeature } from "../../utils/partner";

export async function currentPartner(): Promise<PartnerIdentity | null> {
  const jar = await cookies();
  return resolveSession(jar.get(sessionCookieName())?.value ?? null);
}

/**
 * The signed-in partner, or a redirect to sign-in. Never returns null.
 *
 * Also the agreement gate for every portal page: until the firm has accepted
 * the current partner agreement, every page sends them to /partner/agreement.
 * Gating here rather than per page means a page added later cannot forget it.
 */
export async function requirePartnerPage(): Promise<PartnerIdentity> {
  const identity = await requireSignedInPartnerPage();
  if (!identity.agreementAccepted) redirect("/partner/agreement");
  return identity;
}

/** Signed in, agreement or not. Only the agreement page itself uses this. */
export async function requireSignedInPartnerPage(): Promise<PartnerIdentity> {
  const identity = await currentPartner();
  if (!identity) redirect("/partner");
  return identity;
}

export function has(identity: PartnerIdentity, feature: PartnerFeature): boolean {
  return canUse(new Set(identity.features), feature);
}
