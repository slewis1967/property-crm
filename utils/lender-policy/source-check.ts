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
  /** The source resolved and is usable evidence. */
  ok: boolean;
  /**
   * The host refused an automated client (WAF / bot filter), so the check
   * produced NO evidence either way.
   *
   * This matters because such a host returns 403 for *every* path — including
   * one a model invented — so a 403 is not a pass and not a fail. It is the
   * absence of a result, and the caller must treat it as "unverifiable" rather
   * than quietly rounding it to either. Several real lender sites
   * (reduceloans.com.au, mezybroker.com.au) sit behind exactly this.
   */
  blocked: boolean;
  status: number | null;
  reason: string | null;
};

/** Statuses that mean "a bot filter said no", not "this page is gone". */
const BLOCKED_STATUSES = new Set([401, 403, 405, 406, 429, 451]);

/**
 * Does this connection failure prove the page isn't there, or only that we
 * couldn't complete the request?
 *
 * TLS chain errors are the second kind: the host completed a handshake, so it
 * exists — Node just won't fetch the missing intermediate certificate that
 * browsers and curl do. (unity.bank is a live example.) Treating that as
 * "invented URL" would reject real sources.
 */
function isInconclusiveNetworkError(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  const cause = (err as { cause?: { code?: unknown }; code?: unknown } | null)?.cause;
  const code = String(
    (cause && typeof cause === "object" ? cause.code : undefined) ??
      (err as { code?: unknown })?.code ??
      "",
  );
  return (
    code.startsWith("UNABLE_TO_") ||
    code.startsWith("CERT_") ||
    code.startsWith("SELF_SIGNED") ||
    code.startsWith("DEPTH_ZERO") ||
    code.startsWith("ERR_TLS") ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "EPROTO"
  );
}

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
    return { url, ok: false, blocked: false, status: null, reason: "Not a valid URL" };
  }
  if (!isPubliclyRoutable(parsed)) {
    return { url, ok: false, blocked: false, status: null, reason: "Not a public web address" };
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
    const blocked = !ok && BLOCKED_STATUSES.has(res.status);
    return {
      url,
      ok,
      blocked,
      status: res.status,
      reason: ok
        ? null
        : blocked
          ? `Host refused an automated request (HTTP ${res.status}) — the source could not be machine-verified either way`
          : `Source returned HTTP ${res.status}`,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    // A timeout or a TLS-chain failure is inconclusive for the same reason a
    // 403 is: it says nothing about whether the page exists.
    const inconclusive = isInconclusiveNetworkError(err);
    return {
      url,
      ok: false,
      blocked: inconclusive,
      status: null,
      reason: aborted
        ? "Source did not respond within 8s"
        : inconclusive
          ? "Source could not be checked from the server (TLS or connection error) — verify it by hand"
          : "Source could not be reached",
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

  const all = [...results.values()];
  const dead = all.filter((r) => !r.ok && !r.blocked).length;
  const blocked = all.filter((r) => r.blocked).length;
  if (dead > 0 || blocked > 0) {
    log.info("lender_policy.source_check", { checked: unique.length, dead, blocked });
  }
  return results;
}
