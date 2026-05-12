/**
 * Cloudflare Access user identity helpers.
 *
 * crm.nextkey.com.au sits behind Cloudflare Access — every request that
 * reaches the Netlify origin carries `cf-access-authenticated-user-email`
 * (and a signed JWT in `cf-access-jwt-assertion` we don't verify here
 * because the origin only sees requests CF Access already authorised).
 *
 * Server Components can read the header via `headers()` from next/headers.
 * API routes get it from the standard Request.
 *
 * In local dev there's no CF Access, so we fall back to a DEV_USER_EMAIL
 * env var (or Sean) so the inbox still works.
 */
import { headers } from "next/headers";

const DEV_DEFAULT = process.env.DEV_USER_EMAIL ?? "sean.l@nextkey.com.au";

/** Read the authenticated user's email from a server component. */
export async function currentUserEmail(): Promise<string> {
  const h = await headers();
  return (
    h.get("cf-access-authenticated-user-email") ??
    h.get("x-user-email") ??
    DEV_DEFAULT
  );
}

/** Read the authenticated user's email from a Request (API route). */
export function userEmailFromRequest(req: Request): string {
  return (
    req.headers.get("cf-access-authenticated-user-email") ??
    req.headers.get("x-user-email") ??
    DEV_DEFAULT
  );
}
