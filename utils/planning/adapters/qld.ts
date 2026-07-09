/**
 * QLD adapter.
 *
 * Queensland has excellent free cadastre (with an authoritative area and the
 * local-authority name), but — unlike NSW/VIC — there is NO statewide zoning
 * layer. Planning zones live in ~77 individual council schemes. So this adapter
 * resolves the parcel authoritatively and records the council; the zone + the
 * numeric controls come from the council scheme (AI/scheme lookup for now,
 * per-council adapters to be added starting with NextKey's patch — Ipswich,
 * Townsville).
 *
 * Cadastre: PlanningCadastre/LandParcelPropertyFramework MapServer, parcel
 *           layer 4 (fields lot / plan / lotplan / lot_area / shire_name).
 */

import type { LngLat, SiteData, StateAdapter } from "../types";
import { esriToGeoJSON, firstNumber, queryPoint } from "../arcgis";

const CAD =
  "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer";

const L_PARCEL = 4;

export const qldAdapter: StateAdapter = {
  code: "QLD",
  name: "Queensland",
  async gather(point: LngLat): Promise<Partial<SiteData>> {
    const out: Partial<SiteData> = { overlays: [], sources: [], notes: [] };

    const parcel = await queryPoint(CAD, L_PARCEL, point, { returnGeometry: true });
    if (parcel) {
      const a = parcel.attributes;
      const geometry = esriToGeoJSON(parcel.geometry);
      const areaSqm = firstNumber(a.lot_area);
      out.parcel = {
        lot: (a.lot as string) ?? null,
        plan: (a.plan as string) ?? null,
        lotPlan: (a.lotplan as string) ?? null,
        areaSqm,
        areaEstimated: areaSqm == null,
        lga: (a.shire_name as string) ?? null,
        locality: (a.locality as string) ?? null,
        geometry,
      };
      out.sources!.push({ name: "QLD Land Parcel Property Framework — DNRME", url: CAD });
    }

    out.notes!.push(
      "QLD has no statewide zoning layer — the zone, height, density and assessment category come from the local council planning scheme. Council scheme lookup applies for this address (per-council data wiring starts with Ipswich and Townsville).",
    );
    return out;
  },
};
