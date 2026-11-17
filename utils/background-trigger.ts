/**
 * Hand work to a Netlify background function (`/.netlify/functions/<name>`).
 *
 * Shared by the partner and staff feasibility jobs. Secured by the CRON_SECRET
 * bearer the functions check; carries the Cloudflare Access service token for
 * the case where the address is the Access-protected production host.
 *
 * Only a real 202 counts as handed over. Redirects are NOT followed: a
 * Cloudflare Access login redirect, or any page reached by following one, must
 * never read as success. Every attempt is logged with the host it went to and
 * the status that came back (never the secret), because a silent failure here
 * leaves a report "being written" for ever.
 */
export type TriggerResult = { ok: boolean; status: number | null; host: string | null; location: string | null };

/**
 * Where background functions are called. NOT the production hostname: that is
 * behind Cloudflare Access, which answers the service token with a 302 to its
 * login page for these paths (measured 17 Nov 2026), so no job ever ran. The
 * site's own netlify.app address skips Cloudflare; proxy.ts lets exactly these
 * function paths through (isBackgroundFunctionRoute) and each function checks
 * the CRON_SECRET bearer. DEPLOY_URL would be ideal but is not set when the
 * server runs (the 17 Nov trace showed the call going to URL instead).
 * BACKGROUND_FUNCTION_ORIGIN overrides the default.
 */
export const DEFAULT_BACKGROUND_ORIGIN = "https://crmnex.netlify.app";

export function backgroundFunctionUrl(path: string, override?: string): string {
  const explicit = (override || "").trim();
  if (explicit) return explicit;
  const origin = (process.env.BACKGROUND_FUNCTION_ORIGIN || DEFAULT_BACKGROUND_ORIGIN).replace(/\/$/, "");
  return `${origin}${path}`;
}

export async function triggerBackgroundFunction(
  url: string,
  body: Record<string, unknown>,
  label: string,
): Promise<TriggerResult> {
  const secret = (process.env.CRON_SECRET || "").trim();
  let host: string | null = null;
  try {
    host = url ? new URL(url).host : null;
  } catch {
    host = null;
  }
  if (!url || !secret) {
    console.error(`[${label}] background trigger not configured`, { hasUrl: Boolean(url), hasSecret: Boolean(secret) });
    return { ok: false, status: null, host, location: null };
  }
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${secret}` };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const location = res.headers.get("location");
    const ok = res.status === 202;
    const log = ok ? console.log : console.error;
    log(`[${label}] background trigger`, { host, status: res.status, redirectedTo: location ? new URL(location, url).host : null });
    return { ok, status: res.status, host, location };
  } catch (e) {
    console.error(`[${label}] background trigger failed`, { host, error: e instanceof Error ? e.message : String(e) });
    return { ok: false, status: null, host, location: null };
  }
}
