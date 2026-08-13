import { requireIntroducerPage } from "../../session";
import PortalHeader from "../../PortalHeader";
import NewReferralForm from "./NewReferralForm";
import { CONSENT_STATEMENT, INTRODUCER_FIELD_KEYS } from "../../../../utils/introducer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New referral — NextKey Introducer Portal",
  robots: { index: false, follow: false },
};

export default async function NewReferralPage() {
  const identity = await requireIntroducerPage();
  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader firmName={identity.firmName} userName={identity.fullName ?? identity.email} />
      <main className="mx-auto max-w-3xl px-4 py-7">
        <NewReferralForm
          editable={[...INTRODUCER_FIELD_KEYS]}
          consentStatement={CONSENT_STATEMENT}
        />
      </main>
    </div>
  );
}
