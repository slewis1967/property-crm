/**
 * Planning-data orchestrator.
 *
 * `resolveSite(address)` geocodes the address, selects the state adapter, and
 * assembles a normalised `SiteData` of authoritative facts (parcel, zone,
 * controls, overlays) from government spatial services. It NEVER throws — any
 * failure degrades to lower coverage so the feasibility tool can fall back to
 * AI-only research.
 *
 * Results are cached in the `parcel_lookups` table when it exists (the whole
 * cache path is best-effort: a missing table or DB error is ignored, exactly
 * like `feasibility_reports`), so the tool is safe to deploy before the
 * migration is applied.
 */

import { supabase } from "../supabase";
import { geocodeAU } from "./geocode";
import { nswAdapter } from "./adapters/nsw";
import { vicAdapter } from "./adapters/vic";
import { qldAdapter } from "./adapters/qld";
import type { Coverage, SiteData, StateAdapter, StateCode } from "./types";

export type { SiteData } from "./types";

const ADAPTERS: Partial<Record<StateCode, StateAdapter>> = {
  NSW: nswAdapter,
  VIC: vicAdapter,
  QLD: qldAdapter,
};

const CACHE_TTL_DAYS = 30;

function computeCoverage(site: SiteData): Coverage {
  const hasParcel = !!site.parcel;
  const c = site.controls;
  const hasZone = !!c?.zoneCode;
  const hasNumbers = !!(c && (c.heightLimitM != null || c.fsr != null || c.minLotSizeSqm != null));
  if (hasParcel && hasZone && hasNumbers) return "full";
  if (hasParcel || hasZone) return "partial";
  return "none";
}

async function readCache(address: string): Promise<SiteData | null> {
  try {
    const since = new Date(Date.now() - CACHE_TTL_DAYS * 86400_000).toISOString();
    const { data, error } = await supabase
      .from("parcel_lookups")
      .select("*")
      .eq("address_key", address.trim().toLowerCase())
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      address,
      state: data.state ?? null,
      location: data.lng != null && data.lat != null ? { lng: data.lng, lat: data.lat } : null,
      parcel: data.parcel ?? null,
      controls: data.controls ?? null,
      overlays: data.overlays ?? [],
      sources: data.sources ?? [],
      coverage: data.coverage ?? "none",
      notes: data.notes ?? [],
    };
  } catch {
    return null;
  }
}

async function writeCache(site: SiteData): Promise<void> {
  try {
    await supabase.from("parcel_lookups").insert({
      address_key: site.address.trim().toLowerCase(),
      address: site.address,
      state: site.state,
      lng: site.location?.lng ?? null,
      lat: site.location?.lat ?? null,
      parcel: site.parcel,
      controls: site.controls,
      overlays: site.overlays,
      sources: site.sources,
      coverage: site.coverage,
      notes: site.notes,
    });
  } catch {
    // Table not migrated yet, or transient DB error — caching is optional.
  }
}

/**
 * Resolve authoritative site facts for an Australian address. `useCache` can be
 * disabled for a forced refresh.
 */
export async function resolveSite(address: string, useCache = true): Promise<SiteData> {
  const trimmed = address.trim();
  const empty: SiteData = {
    address: trimmed,
    state: null,
    location: null,
    parcel: null,
    controls: null,
    overlays: [],
    sources: [],
    coverage: "none",
    notes: [],
  };
  if (!trimmed) return empty;

  if (useCache) {
    const cached = await readCache(trimmed);
    if (cached) return cached;
  }

  const geo = await geocodeAU(trimmed);
  if (!geo) {
    return { ...empty, notes: ["Address could not be geocoded — no spatial data resolved."] };
  }

  const site: SiteData = {
    ...empty,
    state: geo.state,
    location: geo.point,
  };

  const adapter = geo.state ? ADAPTERS[geo.state] : undefined;
  if (adapter) {
    const part = await adapter.gather(geo.point, trimmed);
    site.parcel = part.parcel ?? null;
    site.controls = part.controls ?? null;
    site.overlays = part.overlays ?? [];
    site.sources = part.sources ?? [];
    site.notes = part.notes ?? [];
  } else if (geo.state) {
    site.notes = [
      `${geo.state} spatial adapter is not built yet — the report will use AI research and imagery for this address.`,
    ];
  }

  site.coverage = computeCoverage(site);
  if (site.coverage !== "none") await writeCache(site);
  return site;
}

/**
 * Render a SiteData into a concise "authoritative facts" block for the AI. The
 * model is told to treat present figures as verified and to only defer to
 * Council for figures NOT listed.
 */
export function siteToPromptBlock(site: SiteData): string {
  if (site.coverage === "none" && !site.parcel && !site.controls) {
    const why = site.notes[0] ?? "no authoritative government spatial data was available for this address";
    return `AUTHORITATIVE SITE DATA: none resolved (${why}). Research the parcel, zone, controls and overlays from the local scheme and the attached imagery, and mark figures as "to be confirmed with Council".`;
  }

  const lines: string[] = [];
  if (site.state) lines.push(`- State: ${site.state}`);
  const p = site.parcel;
  if (p) {
    const ref = p.lotPlan ?? [p.lot, p.plan].filter(Boolean).join("/");
    const area =
      p.areaSqm != null
        ? `${p.areaSqm.toLocaleString()} m²${p.areaEstimated ? " (estimated from parcel geometry)" : ""}`
        : "area not stated";
    lines.push(`- Parcel: ${ref || "identified"}, ${area}`);
    if (p.lga) lines.push(`- Council / LGA: ${p.lga}`);
  }
  const c = site.controls;
  if (c) {
    if (c.zoneCode || c.zoneDescription)
      lines.push(`- Zone: ${[c.zoneCode, c.zoneDescription].filter(Boolean).join(" — ")}`);
    if (c.instrument) lines.push(`- Planning instrument: ${c.instrument}`);
    if (c.heightLimitM != null) lines.push(`- Maximum building height: ${c.heightLimitM} m`);
    if (c.fsr != null) lines.push(`- Floor space ratio (FSR): ${c.fsr}:1`);
    if (c.minLotSizeSqm != null) lines.push(`- Minimum lot size: ${c.minLotSizeSqm.toLocaleString()} m²`);
  }
  if (site.overlays.length) {
    for (const o of site.overlays)
      lines.push(`- Overlay (${o.kind}): ${o.label}${o.detail ? ` — ${o.detail}` : ""}`);
  }
  if (site.sources.length) lines.push(`- Sources: ${site.sources.map((s) => s.name).join("; ")}`);
  const caveats = site.notes.length ? `\nCaveats: ${site.notes.join(" ")}` : "";

  return (
    `AUTHORITATIVE SITE DATA (from Australian government spatial services — treat every figure below as VERIFIED; do not contradict it or re-label it "to be confirmed"):\n` +
    lines.join("\n") +
    caveats +
    `\nUse these verified figures verbatim in the report and cite the government source. Only figures NOT listed above need to be confirmed with Council or a surveyor.`
  );
}
