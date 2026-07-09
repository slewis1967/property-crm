/**
 * VIC adapter.
 *
 * Victoria publishes parcel + zoning as free ArcGIS REST layers on the Vicplan
 * "mapshare" host (the ArcGIS Online mirror at services-ap1.arcgis.com was
 * unreachable during testing, so we use mapshare directly — more reliable).
 *
 * Parcel:  Planning/VicPlan_PropertyAndParcel MapServer, "Parcel" layer 4.
 * Zoning:  PlanningPortal/PORTAL_PlanningSchemeZones MapServer, "All Zones"
 *          layer 0 (single queryable feature layer; fields ZONE_CODE / LGA).
 *
 * Height, FSR and minimum lot size are NOT statewide spatial data in VIC — they
 * live in the planning-scheme ordinance text (schedules to the zone). We resolve
 * the zone authoritatively and leave the numeric controls for the AI/scheme
 * lookup, flagged in `notes`.
 */

import type { LngLat, PlanningControls, SiteData, StateAdapter } from "../types";
import { approxAreaSqm, esriToGeoJSON, queryPoint } from "../arcgis";

const PARCEL =
  "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning/VicPlan_PropertyAndParcel/MapServer";
const ZONES =
  "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/PlanningPortal/PORTAL_PlanningSchemeZones/MapServer";

const L_PARCEL = 4;
const L_ZONE = 0;

export const vicAdapter: StateAdapter = {
  code: "VIC",
  name: "Victoria",
  async gather(point: LngLat): Promise<Partial<SiteData>> {
    const out: Partial<SiteData> = { overlays: [], sources: [], notes: [] };

    // Parcel (Vicmap carries no area attribute here → estimate from geometry).
    const parcel = await queryPoint(PARCEL, L_PARCEL, point, { returnGeometry: true });
    if (parcel) {
      const a = parcel.attributes;
      const geometry = esriToGeoJSON(parcel.geometry);
      out.parcel = {
        lot: (a.PARCEL_LOT_NUMBER as string) ?? null,
        plan: (a.PARCEL_PLAN_NUMBER as string) ?? null,
        lotPlan: (a.PARCEL_SPI as string) ?? (a.PARCEL_PLAN_NUMBER as string) ?? null,
        areaSqm: approxAreaSqm(geometry),
        areaEstimated: true,
        geometry,
      };
      out.sources!.push({ name: "Vicmap Property & Parcel — Vicplan", url: PARCEL });
    }

    // Zone.
    const zone = await queryPoint(ZONES, L_ZONE, point);
    if (zone) {
      const a = zone.attributes;
      const controls: PlanningControls = {
        zoneCode: (a.ZONE_CODE as string) ?? null,
        zoneDescription: (a.ZONE_DESCRIPTION as string) ?? null,
        instrument: a.LGA ? `${a.LGA} Planning Scheme` : null,
      };
      out.controls = controls;
      out.sources!.push({ name: "Victoria Planning Scheme Zones — Vicplan", url: ZONES });
      if (out.parcel && !out.parcel.lga && a.LGA) out.parcel.lga = a.LGA as string;
    }

    out.notes!.push(
      "VIC height, floor-space and minimum-subdivision controls are set in the planning-scheme ordinance (zone schedules and overlays), not as statewide spatial data — confirm from the scheme for this zone.",
      "VIC overlays (heritage, bushfire, flood) are published in Vicplan_PlanningSchemeOverlays and are not yet wired in.",
    );
    return out;
  },
};
