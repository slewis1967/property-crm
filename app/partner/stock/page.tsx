import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import StockBrowser, { type StockInitialFilters } from "./StockBrowser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock — Partner Portal" };

type Search = Record<string, string | string[] | undefined>;

/** Links from dashboard insights pre-set the filters (?state=VIC&maxPrice=650000&available=1). */
function initialFilters(sp: Search): StockInitialFilters {
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 60) : undefined);
  const out: StockInitialFilters = {};
  const state = get("state")?.toUpperCase();
  if (state && /^[A-Z]{2,3}$/.test(state)) out.state = state;
  const q = get("q");
  if (q) out.q = q;
  for (const k of ["minBeds", "maxPrice"] as const) {
    const v = get(k);
    if (v && /^\d+$/.test(v)) out[k] = v;
  }
  const sort = get("sort");
  if (sort && ["newest", "price_asc", "price_desc", "fee_desc"].includes(sort)) out.sort = sort;
  if (get("available") === "1") out.available = true;
  return out;
}

export default async function PartnerStockPage({ searchParams }: { searchParams: Promise<Search> }) {
  const identity = await requirePartnerPage();
  if (!has(identity, "stock")) redirect("/partner/account");
  const sp = await searchParams;
  return (
    <Frame identity={identity}>
      <StockBrowser showFees={has(identity, "referral_fee")} initialFilters={initialFilters(sp)} />
    </Frame>
  );
}
