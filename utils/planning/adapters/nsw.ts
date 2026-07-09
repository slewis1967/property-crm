/**
 * NSW adapter — the reference implementation.
 *
 * NSW is the only state where the full feasibility spine (parcel + zone +
 * height + FSR + minimum lot size + heritage) is available as free, no-key
 * ArcGIS REST feature layers, so the adapter resolves every control directly.
 *
 * Cadastre:  Spatial Services "NSW_Cadastre" MapServer, Lot layer 9.
 * Planning:  ePlanning "Planning_Portal_Principal_Planning" MapServer. The
 *            queryable feature layers are the *children* of the map's group
 *            layers: Zoning 19, FSR 11, Height 14, Min Lot Size 22, Heritage 16.
 * All layers verified live (field names below come from the live services).
 */

import type { LngLat, PlanningControls, SiteData, StateAdapter } from "../types";
import { approxAreaSqm, esriToGeoJSON, firstNumber, queryPoint } from "../arcgis";

const CAD = "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer";
const PLAN =
  "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning/Planning_Portal_Principal_Planning/MapServer";

const L_CADASTRE = 9;
const L_ZONE = 19;
const L_FSR = 11;
const L_HEIGHT = 14;
const L_MINLOT = 22;
const L_HERITAGE = 16;

export const nswAdapter: StateAdapter = {
  code: "NSW",
  name: "New South Wales",
  async gather(point: LngLat): Promise<Partial<SiteData>> {
    const out: Partial<SiteData> = { overlays: [], sources: [], notes: [] };

    // Parcel (with geometry for the map + future envelope).
    const cad = await queryPoint(CAD, L_CADASTRE, point, { returnGeometry: true });
    if (cad) {
      const a = cad.attributes;
      const geometry = esriToGeoJSON(cad.geometry);
      let areaSqm = firstNumber(a.planlotarea);
      const units = String(a.planlotareaunits ?? "").toUpperCase();
      if (areaSqm != null && units.startsWith("H")) areaSqm = Math.round(areaSqm * 10000); // ha → m²
      const authoritativeArea = areaSqm != null;
      out.parcel = {
        lot: (a.lotnumber as string) ?? null,
        plan: (a.planlabel as string) ?? null,
        lotPlan:
          (a.lotidstring as string) ??
          (a.lotnumber && a.planlabel ? `${a.lotnumber}/${a.planlabel}` : null),
        areaSqm: authoritativeArea ? areaSqm : approxAreaSqm(geometry),
        areaEstimated: !authoritativeArea,
        geometry,
      };
      out.sources!.push({ name: "NSW Cadastre — Spatial Services", url: CAD });
    }

    // Zoning + numeric controls.
    const controls: PlanningControls = {};
    const zone = await queryPoint(PLAN, L_ZONE, point);
    if (zone) {
      const a = zone.attributes;
      controls.zoneCode = (a.SYM_CODE as string) ?? null;
      controls.zoneDescription = (a.LAY_CLASS as string) ?? null;
      controls.landUse = (a.LAY_CLASS as string) ?? null;
      controls.instrument = (a.EPI_NAME as string) ?? null;
      if (out.parcel && !out.parcel.lga && a.LGA_NAME) out.parcel.lga = a.LGA_NAME as string;
    }
    const fsr = await queryPoint(PLAN, L_FSR, point);
    if (fsr) controls.fsr = firstNumber(fsr.attributes.FSR);
    const height = await queryPoint(PLAN, L_HEIGHT, point);
    if (height) controls.heightLimitM = firstNumber(height.attributes.MAX_B_H_M, height.attributes.MAX_B_H);
    const minlot = await queryPoint(PLAN, L_MINLOT, point);
    if (minlot) controls.minLotSizeSqm = firstNumber(minlot.attributes.LOT_SIZE);

    if (Object.values(controls).some((v) => v != null)) {
      out.controls = controls;
      out.sources!.push({ name: "NSW ePlanning — Principal Planning Layers", url: PLAN });
    }

    // Heritage overlay.
    const her = await queryPoint(PLAN, L_HERITAGE, point);
    if (her) {
      const a = her.attributes;
      out.overlays!.push({
        kind: "heritage",
        label: "Heritage item / conservation area affects this site",
        detail:
          [a.H_NAME, a.SIG ? `significance: ${a.SIG}` : null].filter(Boolean).join(" — ") || null,
      });
    }

    out.notes!.push(
      "NSW flood and bushfire-prone-land overlays are published separately (council LEP / RFS) and are not yet wired in — verify with Council and the NSW RFS.",
    );
    return out;
  },
};
