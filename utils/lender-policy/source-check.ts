/**
 * Source-URL resolution check — the network half of verification.
 *
 * `verify.ts` can tell that a URL is well-formed. Only a request can tell that
 * it exists. A model that invents a policy fact very often invents a
 * plausible-looking URL to go with it (`/broker/credit-policy.pdf` on the right
 * domain), and that is precisely the case a shape check cannot catch. So before
 * a research pass is accepted, every distinct source URL is fetched; facts
 * whose source does not resolve are rejected outright.
 *
 * Server-only (uses `fetch` against arbitrary external hosts). Kept out of
 * `verify.ts` so the rules there stay pure and unit-testable offline.
 */

import { log } from "../logger";

export type UrlCheck = {
  url: string;
  ok: boolean;
  status: number | null;
  reason: string | null;
};

const TIMEOUT_MS = 8000;
const MAX_CONCURRENCY = 6;

/**
 * Hosts that must never be fetched. This runs on server-side URLs supplied by
 * a language model, so it is an SSRF surface: without this, a hallucinated
 * "source" of `http://169.254.169.254/latest/meta-data/` would be dutifully
 * requested by our own infrastructure.
 */
function isPubliclyRoutable(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (host === "metadata.google.internal") return false;
  // Bare IP literals — block loopback, link-local, and RFC1918 space.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
  }
  if (host.includes(":")) return false; // IPv6 literal — not a lender website
  return true;
}

async function checkOne(url: string): Promise<UrlCheck> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, ok: false, status: null, reason: "Not a valid URL" };
  }
  if (!isPubliclyRoutable(parsed)) {
    return { url, ok: false, status: null, reason: "Not a public web address" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // HEAD first — cheap, and enough for most lender pages. A surprising number
    // of bank sites reject HEAD with 403/405, so fall back to a ranged GET
    // rather than recording a real page as dead.
    let res = await fetch(parsed.toString(), {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "NextKeyCRM-LenderPolicyResearch/1.0 (+policy source verification)" },
    });
    if (res.status === 403 || res.status === 405 || res.status === 501) {
      res = await fetch(parsed.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "NextKeyCRM-LenderPolicyResearch/1.0 (+policy source verification)",
          range: "bytes=0-2047",
        },
      });
    }
    const ok = res.status >= 200 && res.status < 400;
    return {
      url,
      ok,
      status: res.status,
      reason: ok ? null : `Source returned HTTP ${res.status}`,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      url,
      ok: false,
      status: null,
      reason: aborted ? "Source did not respond within 8s" : "Source could not be reached",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Check a set of URLs with bounded concurrency. Deduplicates first. */
export async function checkSourceUrls(urls: string[]): Promise<Map<string, UrlCheck>> {
  const unique = [...new Set(urls.filter((u) => typeof u === "string" && u.trim() !== ""))];
  const results = new Map<string, UrlCheck>();
  let cursor = 0;

  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= unique.length) return;
      const url = unique[index];
      results.set(url, await checkOne(url));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, unique.length) }, () => worker()),
  );

  const dead = [...results.values()].filter((r) => !r.ok).length;
  if (dead > 0) log.info("lender_policy.dead_sources", { checked: unique.length, dead });
  return results;
}
