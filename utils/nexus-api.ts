/**
 * Server-side fetch wrapper for the NEXUS Flask API.
 *
 * The CRM (Windows) reaches the API (WSL) via WSL2 localhost-forwarding when
 * gunicorn binds to 0.0.0.0:8765. AUTH_MODE=tunnel on the API rejects any
 * unauthenticated request, so this helper attaches the shared X-Internal-Auth
 * header configured in `.env.local`. Server-side only (NEXUS_INTERNAL_API_KEY
 * is not exposed to the browser).
 */
const NEXUS_API_BASE = process.env.NEXUS_API_BASE ?? "http://localhost:8765";
const INTERNAL_KEY = process.env.NEXUS_INTERNAL_API_KEY;

export async function nexusApi(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${NEXUS_API_BASE}${path}`;
  const headers = new Headers(init.headers);
  if (INTERNAL_KEY && !headers.has("X-Internal-Auth")) {
    headers.set("X-Internal-Auth", INTERNAL_KEY);
  }
  return fetch(url, { ...init, headers, cache: init.cache ?? "no-store" });
}
