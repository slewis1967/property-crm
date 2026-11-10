/**
 * Server-side session resolution for the introducer PAGES (not the API).
 *
 * Pages resolve the session themselves rather than deferring to a client-side
 * fetch, so a signed-out visitor is redirected before any markup is produced.
 * A page that renders first and checks second leaks its shape — and, worse,
 * flashes another firm's referral list if a stale client cache is ever involved.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession, sessionCookieName, type IntroducerIdentity } from "../../utils/introducer-auth";

/** The signed-in introducer, or null. */
export async function currentIntroducer(): Promise<IntroducerIdentity | null> {
  const jar = await cookies();
  return resolveSession(jar.get(sessionCookieName())?.value ?? null);
}

/** The signed-in introducer, or a redirect to the sign-in page. Never returns null. */
export async function requireIntroducerPage(): Promise<IntroducerIdentity> {
  const identity = await currentIntroducer();
  if (!identity) redirect("/introducer");
  return identity;
}
