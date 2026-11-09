import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import StockBrowser from "./StockBrowser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock — Partner Portal" };

export default async function PartnerStockPage() {
  const identity = await requirePartnerPage();
  if (!has(identity, "stock")) redirect("/partner/account");
  return (
    <Frame identity={identity}>
      <StockBrowser showFees={has(identity, "referral_fee")} accent={identity.branding.accentColor} />
    </Frame>
  );
}
