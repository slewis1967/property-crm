import { notFound, redirect } from "next/navigation";
import { has, requirePartnerPage } from "../../session";
import { loadPartnerStock } from "../../../../utils/partner-stock";
import { findStockSuburb, stockSuburbs } from "../../../../utils/partner-suburbs";
import { BUSINESS_TIME_ZONE } from "../../../../utils/datetime";
import SuburbReport from "./SuburbReport";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suburb report — Partner Portal" };

/**
 * Printable suburb report. Standalone (no portal frame) so only the report
 * prints. The research itself is fetched client-side from
 * /api/partner/suburbs/report, because a first-time suburb can take ~30s.
 */
export default async function SuburbReportPage({ searchParams }: { searchParams: Promise<{ suburb?: string; state?: string }> }) {
  const identity = await requirePartnerPage();
  if (!has(identity, "suburb_reports")) redirect("/partner/account");

  const { suburb, state } = await searchParams;
  const lots = await loadPartnerStock({ showFees: false });
  const match = findStockSuburb(stockSuburbs(lots), suburb, state);
  if (!match) notFound();

  const inSuburb = lots
    .filter((l) => l.suburb?.trim().toLowerCase() === match.suburb.toLowerCase() && (l.state ?? "").toUpperCase() === (match.state ?? ""))
    .filter((l) => l.availability === "available")
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    .slice(0, 8)
    .map((l) => ({ id: l.id, ref: l.ref, propertyType: l.propertyType, bedrooms: l.bedrooms, bathrooms: l.bathrooms, landSizeSqm: l.landSizeSqm, price: l.price }));

  const asAt = new Date().toLocaleDateString("en-AU", { timeZone: BUSINESS_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });

  return (
    <SuburbReport
      suburb={match.suburb}
      state={match.state}
      stats={{ count: match.count, available: match.available, minPrice: match.minPrice, maxPrice: match.maxPrice }}
      lots={inSuburb}
      branding={identity.branding}
      firmName={identity.firmName}
      preparedBy={identity.fullName ?? ""}
      asAt={asAt}
    />
  );
}
