import { notFound, redirect } from "next/navigation";
import { has, requirePartnerPage } from "../../../session";
import { loadPartnerLot } from "../../../../../utils/partner-stock";
import { toSheetLot } from "../../../../../utils/partner-lot-sheet";
import { BUSINESS_TIME_ZONE } from "../../../../../utils/datetime";
import { loadOwnClient, logPartnerEvent } from "../../../../api/partner/_shared";
import LotSheet from "./LotSheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lot sheet — Partner Portal" };

/**
 * A printable one-page sheet for a buyer (Print → Save as PDF). Standalone:
 * no portal frame, so nothing but the sheet prints. Professional and
 * Enterprise plans (`lot_sheets`).
 *
 * The fee is never loaded for this page (showFees:false), so it cannot reach
 * the sheet even by mistake; toSheetLot then picks the printable fields.
 */
export default async function LotSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ client?: string }>;
}) {
  const identity = await requirePartnerPage();
  if (!has(identity, "stock")) redirect("/partner/account");
  if (!has(identity, "lot_sheets")) redirect("/partner/account");

  const { id } = await params;
  const lot = await loadPartnerLot(id, { showFees: false });
  if (!lot) notFound();

  // A client id only ever resolves within this firm's own book.
  const { client } = await searchParams;
  const own = client ? await loadOwnClient(identity, client) : null;
  const clientName = own ? [own.first_name, own.last_name].filter(Boolean).join(" ") : "";

  await logPartnerEvent({
    partnerId: identity.partnerId,
    clientId: own?.id ?? null,
    actorType: "partner",
    actor: identity.email,
    action: "lot_sheet_opened",
    detail: { property_id: lot.id, ref: lot.ref },
  });

  const asAt = new Date().toLocaleDateString("en-AU", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <LotSheet
      lot={toSheetLot(lot)}
      lotId={lot.id}
      branding={identity.branding}
      firmName={identity.firmName}
      preparedBy={identity.fullName ?? ""}
      initialClientName={clientName}
      asAt={asAt}
    />
  );
}
