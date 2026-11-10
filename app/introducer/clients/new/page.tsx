import { redirect } from "next/navigation";
import { requireIntroducerPage } from "../../session";
import PortalHeader from "../../PortalHeader";
import AccreditationNotice from "../../AccreditationNotice";
import NewReferralForm from "./NewReferralForm";
import PackChooser from "./PackChooser";
import {
  CONSENT_STATEMENT,
  INTRODUCER_FIELD_KEYS,
  canSendFullPack,
} from "../../../../utils/introducer";
import { businessDayKey } from "../../../../utils/datetime";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New referral — Springboard Introducer Portal",
  robots: { index: false, follow: false },
};

/**
 * No `?pack=` — choose. `?pack=referral` or `?pack=full` — start that one.
 *
 * THE TIER CHECK IS HERE, ON THE SESSION, NOT ON THE QUERY STRING. A Tier 1 firm
 * that types ?pack=full lands back on the chooser, which says why, rather than
 * on a form the create route would refuse after they had filled it in. Two more
 * refusals sit behind this one — the route, and a database trigger — so this is
 * about arriving at the honest answer before the typing, not about security.
 */
export default async function NewReferralPage({
  searchParams,
}: {
  searchParams: Promise<{ pack?: string }>;
}) {
  const identity = await requireIntroducerPage();
  const { pack } = await searchParams;
  const tier2 = canSendFullPack(identity.tier);

  if (pack === "full" && !tier2) redirect("/introducer/clients/new");

  const chrome = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader firmName={identity.firmName} userName={identity.fullName ?? identity.email} />
      <AccreditationNotice
        accreditationExpiresAt={identity.accreditationExpiresAt}
        smsfCompetencyExpiresAt={identity.smsfCompetencyExpiresAt}
        today={businessDayKey(new Date().toISOString())!}
      />
      <main className="mx-auto max-w-3xl px-4 py-7">{children}</main>
    </div>
  );

  /* A Tier 1 firm has nothing to choose between, so it goes straight to the form
   * it has always gone straight to. A fork with one branch is just a page in the
   * way — and the chooser still tells them Tier 2 exists when they DO have
   * something to choose. */
  if (!pack && !tier2) {
    return chrome(
      <NewReferralForm
        packType="referral"
        editable={[...INTRODUCER_FIELD_KEYS]}
        consentStatement={CONSENT_STATEMENT}
      />,
    );
  }

  if (!pack) return chrome(<PackChooser canSendFullPack={tier2} />);

  return chrome(
    <NewReferralForm
      packType={pack === "full" ? "full" : "referral"}
      editable={[...INTRODUCER_FIELD_KEYS]}
      consentStatement={CONSENT_STATEMENT}
    />,
  );
}
