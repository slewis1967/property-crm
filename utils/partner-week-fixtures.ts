/** Test fixtures for the dashboard and week-draft tests. Not imported by app code. */
import type { PartnerLot } from "./partner";

export const NOW = new Date("2026-11-18T02:00:00Z");
export const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

let seq = 0;
export function lot(over: Partial<PartnerLot> = {}): PartnerLot {
  seq++;
  const id = `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`;
  return {
    id,
    ref: `NK-${String(seq).padStart(6, "0")}`,
    suburb: "Tarneit",
    state: "VIC",
    propertyType: "House",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    study: false,
    landSizeSqm: 400,
    houseSizeSqm: 200,
    frontageM: null,
    price: 600_000,
    landPrice: null,
    buildPrice: null,
    contract: null,
    titled: null,
    completion: null,
    landRegistration: null,
    rentWeekly: 620,
    availability: "available",
    referralFee: 25_000,
    updatedAt: day(1),
    listedAt: day(2),
    ...over,
  };
}
