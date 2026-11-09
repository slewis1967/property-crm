/**
 * The public origin to build signing links from.
 *
 * Lives in its own module because more than one route mints `/sign/<token>`
 * links (the advisor route, and the Preliminary Assessment send from the call
 * screen). Two copies of this would be two places to get the host wrong, and a
 * signing link on the wrong host is one the signer cannot open.
 *
 * THE HOST IS NEVER TAKEN ON TRUST FROM THE REQUEST. One caller is the public
 * guest route (app/join/[token]/pa), where the request headers belong to
 * whoever holds a call link. A forged Host or X-Forwarded-Host there would put
 * a real, working signing token for the OTHER applicant into an email that
 * links to a site of the sender's choosing. So: an explicit PUBLIC_APP_URL
 * wins; otherwise the forwarded host is used only if it is one we serve from,
 * and anything else falls back to the canonical host.
 */
const CANONICAL_ORIGIN = "https://crm.nextkey.com.au";

/** Hosts this app is really served from. Lowercase, no port. */
const TRUSTED_HOSTS = new Set(["crm.nextkey.com.au", "crmnex.netlify.app"]);

/** Local development only, so a link minted on a dev machine opens on it. */
const DEV_HOST = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function trustedOriginForHost(
  host: string | null | undefined,
  proto: string | null | undefined,
  isProduction: boolean,
): string {
  const h = (host ?? "").trim().toLowerCase();
  if (TRUSTED_HOSTS.has(h)) return `https://${h}`;
  if (!isProduction && DEV_HOST.test(h)) return `${proto === "https" ? "https" : "http"}://${h}`;
  return CANONICAL_ORIGIN;
}

export function publicOrigin(req: Request): string {
  const env = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");
  return trustedOriginForHost(
    req.headers.get("x-forwarded-host") || req.headers.get("host"),
    req.headers.get("x-forwarded-proto"),
    process.env.NODE_ENV === "production",
  );
}
