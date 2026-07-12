/**
 * Server-side fetch wrapper for the NEXUS Flask API.
 *
 * Two auth headers are attached when env vars are present:
 *   - X-Internal-Auth: Flask-side check (NEXUS_INTERNAL_API_KEY)
 *   - CF-Access-Client-Id / CF-Access-Client-Secret: Cloudflare Access
 *     service token, required when NEXUS_API_BASE points at the public
 *     hostname https://api.nextkey.com.au which is gated by Access.
 *
 * For local dev, leave both CF_ACCESS_* unset and point NEXUS_API_BASE
 * at http://localhost:8765 (or omit it — that's the default). Server-
 * side only — none of these values are exposed to the browser.
 */
const NEXUS_API_BASE = process.env.NEXUS_API_BASE ?? "http://localhost:8765";
const INTERNAL_KEY = process.env.NEXUS_INTERNAL_API_KEY;
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

/**
 * Per-request timeout in ms. A hung NEXUS upstream otherwise blocks the
 * serverless function until Netlify's hard wall-clock limit and surfaces as a
 * user-facing 500/timeout. Default 8s; override with NEXUS_API_TIMEOUT_MS.
 */
function timeoutMs(): number {
  const raw = Number(process.env.NEXUS_API_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 8000;
}

export async function nexusApi(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${NEXUS_API_BASE}${path}`;
  const headers = new Headers(init.headers);
  if (INTERNAL_KEY && !headers.has("X-Internal-Auth")) {
    headers.set("X-Internal-Auth", INTERNAL_KEY);
  }
  if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Id", CF_CLIENT_ID);
    headers.set("CF-Access-Client-Secret", CF_CLIENT_SECRET);
  }

  const ms = timeoutMs();

  // Attempt with an AbortController timeout. A 4xx/5xx is a *resolved* Response,
  // so it is returned as-is (no retry) — only a rejected fetch (network error)
  // or a timeout abort triggers the single retry below.
  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, {
        ...init,
        headers,
        cache: init.cache ?? "no-store",
        signal: init.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (err) {
    // Retry ONCE on a network error / timeout. If the caller supplied their own
    // AbortSignal and it fired, respect it and don't retry.
    if (init.signal?.aborted) throw err;
    return await attempt();
  }
}
