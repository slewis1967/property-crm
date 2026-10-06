/**
 * The public origin to build signing links from. Prefer an explicit env
 * (PUBLIC_APP_URL) so links are always the customer-facing host; otherwise derive
 * from the forwarded host headers Cloudflare/Netlify set.
 *
 * Lives in its own module because more than one route mints `/sign/<token>`
 * links (the advisor route, and the Preliminary Assessment send from the call
 * screen). Two copies of this would be two places to get the host wrong, and a
 * signing link on the wrong host is one the signer cannot open.
 */
export function publicOrigin(req: Request): string {
  const env = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}
