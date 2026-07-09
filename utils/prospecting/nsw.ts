/**
 * NSW region scan — finds parcels with subdivision headroom.
 *
 * Strategy (efficient bulk, not N point-queries): over the region envelope,
 * pull (1) the largest parcels above an area threshold, ordered by area desc,
 * (2) all minimum-lot-size polygons, (3) all zoning polygons — then locally
 * point-in-polygon each parcel's centroid to get its min-lot + zone, and keep
 * residential parcels where area ≥ 2 × min lot (i.e. ≥ 2 lots achievable).
 *
 * A per-feature bbox pre-check keeps the containment loop fast.
 */

import { queryEnvelope, type ArcgisFeature, type Bbox } from "../planning/arcgis";
import { largestRingCentroid, pointInRings, type Pt } from "../envelope/geometry";
import type { Candidate } from "./types";

const CAD = "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer";
const PLAN =
  "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/Planning_Portal_Principal_Planning/MapServer";
const L_CAD = 9;
const L_ZONE = 19;
const L_MINLOT = 22;

type Indexed = { feat: ArcgisFeature; bbox: Bbox };

function ringsBbox(rings: number[][][]): Bbox {
  let xmin = Infinity,
    ymin = Infinity,
    xmax = -Infinity,
    ymax = -Infinity;
  for (const ring of rings)
    for (const [x, y] of ring) {
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
  return [xmin, ymin, xmax, ymax];
}

function indexFeatures(feats: ArcgisFeature[]): Indexed[] {
  return feats
    .filter((f) => f.geometry?.rings?.length)
    .map((f) => ({ feat: f, bbox: ringsBbox(f.geometry!.rings as number[][][]) }));
}

function findContaining(index: Indexed[], c: Pt): ArcgisFeature | null {
  for (const { feat, bbox } of index) {
    if (c[0] < bbox[0] || c[0] > bbox[2] || c[1] < bbox[1] || c[1] > bbox[3]) continue;
    if (pointInRings(c, feat.geometry!.rings as number[][][])) return feat;
  }
  return null;
}

function isResidential(zoneCode: string | null, landUse: string | null): boolean {
  const zc = (zoneCode ?? "").toUpperCase();
  const lc = (landUse ?? "").toLowerCase();
  if (/^R[1-5]$/.test(zc)) return true;
  return lc.includes("residential") && !lc.includes("rural");
}

/**
 * A parcel already subdivided into an existing development (and so NOT a
 * subdivision opportunity): Strata Plans (SP — unit/townhouse complexes),
 * Community/Precinct/Neighbourhood plans (CP/CD/CN), and Strata common property
 * (no lot number on an SP). Only ordinary Torrens Deposited Plans (DP) remain.
 */
function isAlreadyDeveloped(planlabel: string | null, lotidstring: string | null): boolean {
  const pl = (planlabel ?? "").toUpperCase().trim();
  const lid = (lotidstring ?? "").toUpperCase();
  return /^(SP|CP|CD|CN|MPS)\d/.test(pl) || /\/(SP|CP|CD|CN)\d/.test(lid);
}

export async function scanNSW(
  bbox: Bbox,
  opts: { minAreaSqm?: number; maxAreaSqm?: number; maxCandidates?: number } = {},
): Promise<{ candidates: Candidate[]; scanned: number; notes: string[] }> {
  const minAreaSqm = opts.minAreaSqm ?? 800;
  // Upper bound excludes broadacre/rural lots that would otherwise dominate the
  // "largest first" ordering and crowd out genuine residential subdivision lots
  // (and keeps the geometry payload small enough to stay within the timeout).
  const maxAreaSqm = opts.maxAreaSqm ?? 10000;
  const maxCandidates = opts.maxCandidates ?? 40;
  const notes: string[] = [];

  const cadQuery = () =>
    queryEnvelope(CAD, L_CAD, bbox, {
      where: `planlotarea >= ${minAreaSqm} AND planlotarea <= ${maxAreaSqm}`,
      outFields: "lotidstring,lotnumber,planlabel,planlotarea,planlotareaunits",
      orderBy: "planlotarea DESC",
      returnGeometry: true,
      resultRecordCount: 300,
      timeout: 25000,
    });

  const [cadFirst, minlot, zone] = await Promise.all([
    cadQuery(),
    queryEnvelope(PLAN, L_MINLOT, bbox, {
      outFields: "LOT_SIZE,UNITS",
      returnGeometry: true,
      resultRecordCount: 2000,
      timeout: 25000,
    }),
    queryEnvelope(PLAN, L_ZONE, bbox, {
      outFields: "SYM_CODE,LAY_CLASS,LGA_NAME",
      returnGeometry: true,
      resultRecordCount: 2000,
      timeout: 25000,
    }),
  ]);

  // The SIX cadastre occasionally returns an empty geometry response; one retry
  // clears the transient before we conclude there are no candidates.
  const cad = cadFirst.features.length === 0 ? await cadQuery() : cadFirst;

  if (cad.exceeded)
    notes.push(
      `Only the ${cad.features.length} largest parcels in this window were scanned — narrow the region for full coverage.`,
    );
  if (minlot.exceeded || zone.exceeded)
    notes.push("The planning-layer coverage was capped for this window; some parcels may be skipped.");

  const minlotIdx = indexFeatures(minlot.features);
  const zoneIdx = indexFeatures(zone.features);

  const candidates: Candidate[] = [];
  let excludedDeveloped = 0;
  for (const p of cad.features) {
    const rings = p.geometry?.rings as number[][][] | undefined;
    if (!rings?.length) continue;
    const c = largestRingCentroid(rings);
    if (!c) continue;

    // Skip parcels already subdivided into an existing development (strata /
    // community schemes) — no further subdivision potential.
    if (
      isAlreadyDeveloped(
        (p.attributes.planlabel as string) ?? null,
        (p.attributes.lotidstring as string) ?? null,
      )
    ) {
      excludedDeveloped++;
      continue;
    }

    const ml = findContaining(minlotIdx, c);
    let minLotSqm = Number(ml?.attributes.LOT_SIZE);
    if (!ml || !isFinite(minLotSqm) || minLotSqm <= 0) continue;
    // The min-lot layer expresses large-lot/rural zones in hectares (LOT_SIZE
    // like 2 or 4). Convert via UNITS, with a small-value fallback (a "minimum
    // lot" under 50 is hectares, not m²).
    const mlUnits = String(ml.attributes.UNITS ?? "").toLowerCase();
    if (mlUnits.startsWith("h") || mlUnits.includes("ha") || minLotSqm < 50) minLotSqm *= 10000;

    const z = findContaining(zoneIdx, c);
    const zoneCode = (z?.attributes.SYM_CODE as string) ?? null;
    const landUse = (z?.attributes.LAY_CLASS as string) ?? null;
    if (!isResidential(zoneCode, landUse)) continue;

    let areaSqm = Number(p.attributes.planlotarea);
    if (!isFinite(areaSqm) || areaSqm <= 0) continue;
    if (String(p.attributes.planlotareaunits ?? "").toUpperCase().startsWith("H"))
      areaSqm = areaSqm * 10000;

    const estLots = Math.floor(areaSqm / minLotSqm);
    if (estLots < 2) continue;

    candidates.push({
      lotPlan: (p.attributes.lotidstring as string) ?? null,
      lot: (p.attributes.lotnumber as string) ?? null,
      plan: (p.attributes.planlabel as string) ?? null,
      areaSqm: Math.round(areaSqm),
      minLotSqm,
      estLots,
      extraLots: estLots - 1,
      zoneCode,
      zoneDescription: landUse,
      lga: (z?.attributes.LGA_NAME as string) ?? null,
      center: { lng: c[0], lat: c[1] },
      note:
        estLots > 20
          ? "Broadacre — a master-planned subdivision with new roads/servicing, not a simple battle-axe split."
          : undefined,
    });
  }

  if (excludedDeveloped > 0)
    notes.push(
      `Excluded ${excludedDeveloped} already-developed parcel${excludedDeveloped === 1 ? "" : "s"} (existing strata / community-title schemes).`,
    );

  candidates.sort((a, b) => b.extraLots - a.extraLots || b.areaSqm - a.areaSqm);
  return { candidates: candidates.slice(0, maxCandidates), scanned: cad.features.length, notes };
}
