"use client";

/**
 * Leaflet canvas for the partner Stock Map. Loaded with next/dynamic({ ssr:false })
 * because Leaflet touches `window` at import time.
 *
 * Raster tiles only: the CSP allows `img-src https:` but not third-party
 * connect-src, so a vector renderer would be blocked (see app/properties/map).
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PartnerMapCluster } from "../../../utils/partner-map";
import { bandFor, radiusFor } from "../../properties/map/bands";
import { BASEMAPS, type BasemapId } from "../../properties/map/basemaps";

const AU_CENTER: [number, number] = [-27.5, 133.5];
const AU_ZOOM = 4;

function money(n: number | null): string {
  return n == null ? "Price on request" : `$${Math.round(n).toLocaleString("en-AU")}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export default function MapCanvas({
  clusters,
  selectedKey,
  onSelect,
  basemap,
  brandColor,
}: {
  clusters: PartnerMapCluster[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  basemap: BasemapId;
  brandColor: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const labelsRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const markers = markersRef.current;
    const map = L.map(hostRef.current, { center: AU_CENTER, zoom: AU_ZOOM, scrollWheelZoom: true, preferCanvas: true });
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      baseRef.current = null;
      labelsRef.current = null;
      markers.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const def = BASEMAPS[basemap];
    baseRef.current?.remove();
    baseRef.current = L.tileLayer(def.url, { maxZoom: def.maxZoom, maxNativeZoom: def.maxNativeZoom, attribution: def.attribution }).addTo(map);
    baseRef.current.bringToBack();
    labelsRef.current?.remove();
    labelsRef.current = def.labelsUrl ? L.tileLayer(def.labelsUrl, { maxZoom: def.maxZoom, maxNativeZoom: def.maxNativeZoom }).addTo(map) : null;
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    for (const c of clusters) {
      const marker = L.circleMarker([c.lat, c.lng], { radius: radiusFor(c.count), weight: 1.5, fillColor: bandFor(c.medianPrice).color });
      marker.bindTooltip(
        `<strong>${escapeHtml(c.suburb)}${c.state ? `, ${escapeHtml(c.state)}` : ""}</strong><br/>` +
          `${c.count} ${c.count === 1 ? "lot" : "lots"} · ${c.available} available<br/>typical ${money(c.medianPrice)}`,
        { direction: "top", offset: [0, -4] },
      );
      marker.on("click", () => onSelectRef.current(c.key));
      marker.addTo(layer);
      markersRef.current.set(c.key, marker);
    }
    if (clusters.length > 0) {
      map.fitBounds(L.latLngBounds(clusters.map((c) => [c.lat, c.lng] as [number, number])), { padding: [40, 40], maxZoom: 11 });
    } else {
      map.setView(AU_CENTER, AU_ZOOM);
    }
  }, [clusters]);

  useEffect(() => {
    const onImagery = basemap !== "streets";
    for (const [key, marker] of markersRef.current) {
      const active = key === selectedKey;
      marker.setStyle({
        color: active ? brandColor : onImagery ? "#0b1220" : "#ffffff",
        weight: active ? 4 : 1.5,
        fillOpacity: active ? 0.95 : onImagery ? 0.88 : 0.78,
      });
      if (active) marker.bringToFront();
    }
  }, [selectedKey, basemap, clusters, brandColor]);

  useEffect(() => {
    if (!selectedKey) return;
    const marker = markersRef.current.get(selectedKey);
    const map = mapRef.current;
    if (marker && map) map.panTo(marker.getLatLng());
  }, [selectedKey]);

  return <div ref={hostRef} className="h-full w-full" />;
}
