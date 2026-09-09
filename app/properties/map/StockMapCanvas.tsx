"use client";

/**
 * The Leaflet canvas for the Stock Map — one bubble per suburb, radius scaled
 * by how many properties sit there, colour by median package price.
 *
 * Loaded via next/dynamic({ ssr:false }) from StockMapClient, because Leaflet
 * touches `window` at import time and would break the server render.
 *
 * CSP note: the app's Content-Security-Policy allows `img-src https:` but
 * restricts `connect-src` to self + Supabase. That is exactly why this uses
 * RASTER tiles (plain <img> requests, allowed) rather than a vector-tile
 * renderer like MapLibre, whose style/tile fetches would be blocked.
 */

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SuburbCluster } from "../../../utils/geo/clusters";
// Styling constants live in a Leaflet-free module so StockMapClient can
// import the legend without dragging Leaflet into the server bundle.
import { bandFor, radiusFor } from "./bands";
import { BASEMAPS, type BasemapId } from "./basemaps";

// Whole-of-Australia starting view — the stock spans QLD to WA.
const AU_CENTER: [number, number] = [-27.5, 133.5];
const AU_ZOOM = 4;

// Brand teal, matching the selected state of the view switcher.
const SELECTED_STROKE = "#0F4C5C";

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

type Props = {
  clusters: SuburbCluster[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  basemap: BasemapId;
};

export default function StockMapCanvas({ clusters, selectedKey, onSelect, basemap }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  // The basemap and its optional label overlay are swapped in place when the
  // user changes view, so the bubbles and the current viewport survive.
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);
  // Keep the latest onSelect in a ref so re-binding every marker isn't
  // required each time the parent re-renders with a new closure.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once.
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    // Captured for the cleanup closure — markersRef.current may point at a
    // different Map by the time this effect tears down.
    const markers = markersRef.current;

    const map = L.map(hostRef.current, {
      center: AU_CENTER,
      zoom: AU_ZOOM,
      scrollWheelZoom: true,
      // The bubbles carry the meaning; a busy basemap fights them.
      preferCanvas: true,
    });

    // The tile layer itself is added by the basemap effect below, so there is
    // exactly one place that knows how to build one.
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      baseLayerRef.current = null;
      labelsLayerRef.current = null;
      markers.clear();
    };
  }, []);

  // Swap the basemap (and its label overlay) without touching the bubbles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const def = BASEMAPS[basemap];

    baseLayerRef.current?.remove();
    baseLayerRef.current = L.tileLayer(def.url, {
      maxZoom: def.maxZoom,
      maxNativeZoom: def.maxNativeZoom,
      attribution: def.attribution,
    }).addTo(map);
    // Imagery must sit under the bubbles; Leaflet stacks by insertion order
    // within a pane, so an explicitly re-added base layer needs sending back.
    baseLayerRef.current.bringToBack();

    labelsLayerRef.current?.remove();
    labelsLayerRef.current = null;
    if (def.labelsUrl) {
      labelsLayerRef.current = L.tileLayer(def.labelsUrl, {
        maxZoom: def.maxZoom,
        maxNativeZoom: def.maxNativeZoom,
      }).addTo(map);
    }
  }, [basemap]);

  // Redraw bubbles whenever the cluster set changes (i.e. on filter change).
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    markersRef.current.clear();

    for (const c of clusters) {
      const band = bandFor(c.medianPrice);
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: radiusFor(c.count),
        weight: 1.5,
        fillColor: band.color,
      });

      marker.bindTooltip(
        `<strong>${c.suburb}${c.state ? `, ${c.state}` : ""}</strong><br/>` +
          `${c.count} ${c.count === 1 ? "property" : "properties"}<br/>` +
          `median ${money(c.medianPrice)}`,
        { direction: "top", offset: [0, -4] },
      );
      marker.on("click", () => onSelectRef.current(c.key));

      marker.addTo(layer);
      markersRef.current.set(c.key, marker);
    }

    // Frame the stock we actually have, rather than always showing the whole
    // continent — filtering to QLD should zoom to QLD.
    if (clusters.length > 0) {
      const bounds = L.latLngBounds(clusters.map((c) => [c.lat, c.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
    } else {
      map.setView(AU_CENTER, AU_ZOOM);
    }
  }, [clusters]);

  // Marker styling depends on BOTH the basemap and the selection, so one
  // effect owns it. Crucially this is separate from the drawing effect above:
  // switching basemap must not re-run fitBounds, or zooming into a suburb and
  // then flipping to Satellite throws you back out to the whole continent.
  useEffect(() => {
    // A white ring vanishes against pale rooftops and concrete; a dark ring
    // vanishes against the streets basemap. Pick per basemap.
    const onImagery = basemap !== "streets";
    for (const [key, marker] of markersRef.current) {
      const active = key === selectedKey;
      marker.setStyle({
        color: active ? SELECTED_STROKE : onImagery ? "#0b1220" : "#ffffff",
        weight: active ? 4 : 1.5,
        // Imagery is busy and dark; a translucent bubble over it reads as mud.
        fillOpacity: active ? 0.95 : onImagery ? 0.88 : 0.75,
      });
      if (active) marker.bringToFront();
    }
  }, [selectedKey, basemap, clusters]);

  // Pan to a newly selected suburb — separate from styling so that merely
  // changing basemap doesn't yank the viewport around.
  useEffect(() => {
    if (!selectedKey) return;
    const marker = markersRef.current.get(selectedKey);
    const map = mapRef.current;
    if (marker && map) map.panTo(marker.getLatLng());
  }, [selectedKey]);

  return <div ref={hostRef} className="h-full w-full rounded-xl" />;
}
