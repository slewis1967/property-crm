import { redirect } from "next/navigation";
import { requireIntroducerPage } from "../../../session";
import PortalHeader from "../../../PortalHeader";
import AccreditationNotice from "../../../AccreditationNotice";
import NeedsAnalysisPack from "./NeedsAnalysisPack";
import { canSendFullPack } from "../../../../../utils/introducer";
import { businessDayKey } from "../../../../../utils/datetime";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Needs Analysis — Springboard Introducer Portal",
  robots: { index: false, follow: false },
};

/**
 * The Needs Analysis, for one pack.
 *
 * A Tier 1 firm is redirected rather than shown an explanation, because there is
 * nothing here for them to understand — they cannot have a pack, so they cannot
 * have arrived at this URL except by typing it. Whether THIS referral is a pack,
 * and whether it belongs to them, is decided by the API the form calls; that
 * check filters on the session's introducer id and 404s otherwise.
 */
export default async function IntroducerNeedsAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identity = await requireIntroducerPage();
  if (!canSendFullPack(identity.tier)) redirect("/introducer/clients");

  const { id } = await params;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader firmName={identity.firmName} userName={identity.fullName ?? identity.email} />
      <AccreditationNotice
        accreditationExpiresAt={identity.accreditationExpiresAt}
        smsfCompetencyExpiresAt={identity.smsfCompetencyExpiresAt}
        today={businessDayKey(new Date().toISOString())!}
      />
      <main className="mx-auto max-w-4xl px-4 py-7">
        <NeedsAnalysisPack id={id} />
      </main>
    </div>
  );
}
