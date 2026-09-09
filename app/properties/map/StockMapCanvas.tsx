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

// Whole-of-Australia starting view — the stock spans QLD to WA.
const AU_CENTER: [number, number] = [-27.5, 133.5];
const AU_ZOOM = 4;

/**
 * Price bands for bubble colour. Deliberately coarse and absolute (not
 * quantiles of the current filter) so a suburb keeps the same colour as you
 * filter — a bubble that changes colour when you tick "4 bed" reads as a data
 * change rather than a rescale.
 */
const BANDS: Array<{ max: number; color: string; label: string }> = [
  { max: 600_000, color: "#0d9488", label: "under $600k" },
  { max: 750_000, color: "#0ea5e9", label: "$600k–750k" },
  { max: 900_000, color: "#6366f1", label: "$750k–900k" },
  { max: Infinity, color: "#c026d3", label: "$900k+" },
];
const NO_PRICE_COLOR = "#94a3b8";

export function bandFor(price: number | null): { color: string; label: string } {
  if (price == null) return { color: NO_PRICE_COLOR, label: "no price" };
  return BANDS.find((b) => price < b.max) ?? BANDS[BANDS.length - 1];
}

export const PRICE_LEGEND = [
  ...BANDS.map((b) => ({ color: b.color, label: b.label })),
  { color: NO_PRICE_COLOR, label: "no price" },
];

/**
 * Bubble radius in pixels. Square-root scaling so AREA is proportional to the
 * count — a linear radius would make Tarneit's ~200 lots look overwhelmingly
 * bigger than a 20-lot suburb rather than 10x. Clamped so a single property is
 * still clickable and a huge suburb doesn't swallow its neighbours.
 */
export function radiusFor(count: number): number {
  return Math.max(7, Math.min(34, 5 + Math.sqrt(count) * 3.2));
}

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

type Props = {
  clusters: SuburbCluster[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export default function StockMapCanvas({ clusters, selectedKey, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
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

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
    };
  }, []);

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
        color: "#ffffff",
        weight: 1.5,
        fillColor: band.color,
        fillOpacity: 0.75,
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

  // Highlight the selected suburb and pan to it.
  useEffect(() => {
    for (const [key, marker] of markersRef.current) {
      const active = key === selectedKey;
      marker.setStyle({
        color: active ? "#0F4C5C" : "#ffffff",
        weight: active ? 4 : 1.5,
        fillOpacity: active ? 0.95 : 0.75,
      });
      if (active) marker.bringToFront();
    }
    if (selectedKey) {
      const marker = markersRef.current.get(selectedKey);
      const map = mapRef.current;
      if (marker && map) map.panTo(marker.getLatLng());
    }
  }, [selectedKey]);

  return <div ref={hostRef} className="h-full w-full rounded-xl" />;
}
