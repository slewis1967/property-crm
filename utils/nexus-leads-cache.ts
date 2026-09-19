import { revalidateTag, unstable_cache } from "next/cache";
import { after } from "next/server";
import { nexusApi } from "./nexus-api";
import { errMessage } from "./errors";

/**
 * Short-lived server cache of the NEXUS lead list and pipelines, for the phone
 * view (/m).
 *
 * NEXUS answers slowly: measured 19 Sep 2026, GET /api/leads took 7-9s (the
 * whole table, ~180 KB) and /api/pipelines 3.5-4.5s. On a phone every screen
 * that shows leads was waiting that long. Cached here, repeat views are served
 * at once and refreshed in the background (unstable_cache is
 * stale-while-revalidate).
 *
 * Freshness: the lead list goes stale after LEADS_TTL_S, and any write made
 * through the CRM's opportunity routes expires it immediately
 * (invalidateLeadCache). A change made directly in NEXUS can take up to one
 * TTL, plus one view, to appear. The single-lead page is NOT cached: that's
 * where stage and notes are changed, so it always reads NEXUS.
 *
 * Failures throw inside the cached function so an error is never cached; the
 * wrappers turn them back into { error }.
 */

const LEADS_TAG = "nexus-leads";
const PIPELINES_TAG = "nexus-pipelines";
const LEADS_TTL_S = 60;
const PIPELINES_TTL_S = 600;
// The whole-table read regularly takes 7-9s, right at nexusApi's default 8s
// timeout, and a timeout triggers one retry (so ~16s before failing). Give
// this one call enough room to finish the first time.
const LEADS_TIMEOUT_MS = 20_000;

async function fetchJson(path: string, timeoutMs?: number): Promise<Record<string, unknown>> {
  const res = await nexusApi(path, {
    cache: "no-store",
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!res.ok) throw new Error(`NEXUS API responded ${res.status}`);
  return res.json();
}

const cachedLeads = unstable_cache(
  async () => ((await fetchJson("/api/leads", LEADS_TIMEOUT_MS)).leads as unknown[]) || [],
  ["nexus-leads-v1"],
  { revalidate: LEADS_TTL_S, tags: [LEADS_TAG] },
);

const cachedPipelines = unstable_cache(
  async () => ((await fetchJson("/api/pipelines")).pipelines as unknown[]) || [],
  ["nexus-pipelines-v1"],
  { revalidate: PIPELINES_TTL_S, tags: [PIPELINES_TAG] },
);

export async function getCachedLeads<T>(): Promise<{ leads: T[]; error: string | null }> {
  try {
    return { leads: (await cachedLeads()) as T[], error: null };
  } catch (e) {
    return { leads: [], error: errMessage(e, "Couldn't reach NEXUS API") };
  }
}

/** Pipelines, or [] if NEXUS is unreachable (callers fall back to the default stages). */
export async function getCachedPipelines<T>(): Promise<T[]> {
  try {
    return (await cachedPipelines()) as T[];
  } catch {
    return [];
  }
}

/**
 * Expire the cached lead list now, then refill it once the response has gone
 * out, so the next screen doesn't wait the full 7-9s NEXUS read. Call after
 * any write to a lead.
 */
export function invalidateLeadCache(): void {
  try {
    revalidateTag(LEADS_TAG, { expire: 0 });
    after(() => getCachedLeads());
  } catch {
    // Outside a request context (e.g. unit tests) there is no cache to expire.
  }
}

/** Expire the cached pipelines now. Call after any pipeline write. */
export function invalidatePipelineCache(): void {
  try {
    revalidateTag(PIPELINES_TAG, { expire: 0 });
  } catch {
    // As above.
  }
}
