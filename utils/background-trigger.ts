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

export function backgroundFunctionUrl(path: string, override?: string): string {
  const explicit = (override || "").trim();
  if (explicit) return explicit;
  const site = (process.env.DEPLOY_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || "").replace(/\/$/, "");
  return site ? `${site}${path}` : "";
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
