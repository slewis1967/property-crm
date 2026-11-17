/**
 * Client lot sheet — a one-page document a partner hands their buyer.
 *
 * WHAT IS ON IT is decided here, field by field, from the partner's own masked
 * lot (toPartnerLot). Three things a partner can see are deliberately NOT on it:
 *   - the referral fee (a buyer must never see what their adviser is paid by us),
 *   - the stock id (it is ours, and meaningless to a buyer; the NK- ref is the handle),
 *   - anything that names the supplier — already absent from PartnerLot.
 * Picking fields rather than spreading means a field added to PartnerLot later
 * does not reach a buyer by default; a test pins this.
 *
 * Pure, so the server page and the client sheet share it.
 */
import { assertNoForbiddenKeys, type LotAvailability, type PartnerLot } from "./partner";

export type SheetLot = {
  ref: string;
  suburb: string | null;
  state: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carSpaces: number | null;
  study: boolean;
  landSizeSqm: number | null;
  houseSizeSqm: number | null;
  frontageM: number | null;
  price: number | null;
  landPrice: number | null;
  buildPrice: number | null;
  contract: string | null;
  titled: boolean | null;
  completion: string | null;
  landRegistration: string | null;
  rentWeekly: number | null;
  availability: LotAvailability;
};

export function toSheetLot(lot: PartnerLot): SheetLot {
  return assertNoForbiddenKeys({
    ref: lot.ref,
    suburb: lot.suburb,
    state: lot.state,
    propertyType: lot.propertyType,
    bedrooms: lot.bedrooms,
    bathrooms: lot.bathrooms,
    carSpaces: lot.carSpaces,
    study: lot.study,
    landSizeSqm: lot.landSizeSqm,
    houseSizeSqm: lot.houseSizeSqm,
    frontageM: lot.frontageM,
    price: lot.price,
    landPrice: lot.landPrice,
    buildPrice: lot.buildPrice,
    contract: lot.contract,
    titled: lot.titled,
    completion: lot.completion,
    landRegistration: lot.landRegistration,
    rentWeekly: lot.rentWeekly,
    availability: lot.availability,
  });
}

/** The sheet's title line: "4 bed House & Land, Armstrong Creek VIC". */
export function sheetTitle(lot: Pick<SheetLot, "bedrooms" | "propertyType" | "suburb" | "state">): string {
  const what = [lot.bedrooms ? `${lot.bedrooms} bed` : null, lot.propertyType ?? "Property"].filter(Boolean).join(" ");
  const where = [lot.suburb, lot.state].filter(Boolean).join(" ");
  return where ? `${what}, ${where}` : what;
}

/**
 * Printed on every sheet. Names no brand, because a white-labelled firm hands
 * this out under its own name. Same substance as the shortlist disclaimer
 * (utils/property-shortlist.ts REPORT_DISCLAIMER), which passed review.
 */
export const LOT_SHEET_DISCLAIMER =
  "General information only. Prices, availability and inclusions are supplied by the developer, are indicative " +
  "and can change without notice. The cost and cashflow figures are estimates based on the assumptions shown; " +
  "they are not financial, credit, tax or legal advice, a loan quote or a pre-approval, and do not take your " +
  "personal circumstances into account. Rent is an estimate, not a guarantee. Stamp duty is indicative: confirm " +
  "it with your conveyancer and the state revenue office. Lenders' mortgage insurance, legal fees and ongoing tax " +
  "effects are not included. Speak to a licensed adviser or broker before making a decision.";
