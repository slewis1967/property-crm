import { notFound } from "next/navigation";
import { requireIntroducerPage } from "../../session";
import PortalHeader from "../../PortalHeader";
import ReferralDetail from "./ReferralDetail";
import { loadOwnClient } from "../../../api/introducer/_shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Referral — NextKey Introducer Portal",
  robots: { index: false, follow: false },
};

export default async function ReferralPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requireIntroducerPage();
  const { id } = await params;

  // Ownership is checked here as well as in the API so a referral belonging to
  // another firm 404s before any markup is produced — and 404, not 403, because
  // "this exists but isn't yours" is itself information.
  const record = await loadOwnClient(identity, id);
  if (!record) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader firmName={identity.firmName} userName={identity.fullName ?? identity.email} />
      <main className="mx-auto max-w-3xl px-4 py-7">
        <ReferralDetail id={id} />
      </main>
    </div>
  );
}
