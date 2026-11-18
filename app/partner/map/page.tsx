import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import { loadPartnerStock } from "../../../utils/partner-stock";
import { readCache } from "../../../utils/geo/suburbs";
import { lotSuburbKeys, partnerMapClusters } from "../../../utils/partner-map";
import { PageHeader } from "../ui";
import PartnerMap from "./PartnerMap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Map — Partner Portal" };

/**
 * Stock Map for partners: the masked stock book on a map, one bubble per suburb.
 * Centroids come from the stock_geocodes cache the staff map fills; this page
 * only reads it (no geocoding is triggered by a partner session).
 */
export default async function PartnerMapPage() {
  const identity = await requirePartnerPage();
  if (!has(identity, "stock")) redirect("/partner/account");

  const lots = await loadPartnerStock({ showFees: false });
  const { points } = await readCache(lotSuburbKeys(lots));
  const { clusters, unplaced } = partnerMapClusters(lots, points);

  return (
    <Frame identity={identity}>
      <PageHeader
        eyebrow="Stock book"
        title="Stock map"
        icon="map"
        subtitle="Where our stock sits, suburb by suburb. Bubble size shows how many lots, colour shows the typical price. Pick a suburb to see its lots."
      />
      <PartnerMap
        clusters={clusters}
        unplaced={unplaced}
        brandColor={identity.branding.primaryColor}
        canResearch={has(identity, "suburb_reports")}
      />
    </Frame>
  );
}
