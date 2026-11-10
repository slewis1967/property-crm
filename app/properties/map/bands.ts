/**
 * Bubble styling for the Stock Map — price bands and radius scaling.
 *
 * This lives apart from StockMapCanvas.tsx **specifically because that file
 * imports Leaflet**, which touches `window` at module scope. StockMapClient
 * needs the legend, and a plain `import { PRICE_LEGEND } from "./StockMapCanvas"`
 * pulls Leaflet into the server bundle — defeating the `next/dynamic({ssr:false})`
 * wrapper and crashing the whole page with "window is not defined" during SSR.
 * Keep this module free of Leaflet (and of anything else browser-only).
 */

/**
 * Price bands for bubble colour. Deliberately coarse and ABSOLUTE — not
 * quantiles of the current filter — so a suburb keeps the same colour as you
 * filter. A bubble that changed colour when you ticked "4 bed" would read as a
 * change in the data rather than a rescale of the palette.
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
 * Bubble radius in pixels.
 *
 * Square-root scaled so the bubble's AREA is proportional to the count: a
 * linear radius would make Warragul's 121 lots look ~100x a 20-lot suburb
 * rather than ~6x. Clamped at both ends so a single property stays clickable
 * and a large suburb doesn't swallow its neighbours.
 */
export function radiusFor(count: number): number {
  return Math.max(7, Math.min(34, 5 + Math.sqrt(count) * 3.2));
}
