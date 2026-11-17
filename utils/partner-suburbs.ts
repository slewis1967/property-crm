/**
 * Suburb research reports for channel partners. Pure.
 *
 * A partner may research only a suburb that has stock in the book. That keeps
 * the AI research (web search, billed per call, cached a week per suburb) tied
 * to what we sell, so a session cannot run research on arbitrary places — the
 * same rule the client shortlists apply.
 */
import type { PartnerLot } from "./partner";

export type StockSuburb = {
  suburb: string;
  state: string | null;
  count: number;
  available: number;
  minPrice: number | null;
  maxPrice: number | null;
};

export function suburbKey(suburb: string, state: string | null): string {
  return `${suburb.trim().toLowerCase()}|${(state ?? "").trim().toUpperCase()}`;
}

/** Suburbs in the stock book, busiest first. Lots with no suburb are skipped. */
export function stockSuburbs(lots: readonly PartnerLot[]): StockSuburb[] {
  const map = new Map<string, StockSuburb>();
  for (const lot of lots) {
    const suburb = lot.suburb?.trim();
    if (!suburb) continue;
    const state = lot.state?.trim().toUpperCase() || null;
    const key = suburbKey(suburb, state);
    const row = map.get(key) ?? { suburb, state, count: 0, available: 0, minPrice: null, maxPrice: null };
    row.count += 1;
    if (lot.availability === "available") row.available += 1;
    if (lot.price !== null) {
      row.minPrice = row.minPrice === null ? lot.price : Math.min(row.minPrice, lot.price);
      row.maxPrice = row.maxPrice === null ? lot.price : Math.max(row.maxPrice, lot.price);
    }
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.suburb.localeCompare(b.suburb));
}

/** The stock suburb matching a request, or undefined (→ 404). Case-insensitive. */
export function findStockSuburb(
  list: readonly StockSuburb[],
  suburb: unknown,
  state: unknown,
): StockSuburb | undefined {
  if (typeof suburb !== "string" || !suburb.trim()) return undefined;
  const key = suburbKey(suburb, typeof state === "string" ? state : null);
  return list.find((s) => suburbKey(s.suburb, s.state) === key);
}

/** Firm names the narrative must never carry to a partner's client. */
export const OUR_BRAND_NAMES = ["NextKey Property Strategists", "NextKey Pty Ltd", "NextKey"] as const;

export const SUBURB_REPORT_DISCLAIMER =
  "General information only, prepared from public sources and AI-assisted research. Figures for prices, growth, " +
  "rents and vacancy describe past performance from the sources named and are not a forecast or guarantee of " +
  "future returns. This is not financial, credit, tax or legal advice and does not take anyone's personal " +
  "circumstances into account. Verify anything you rely on and speak to a licensed adviser before deciding.";
