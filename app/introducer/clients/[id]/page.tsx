import { notFound } from "next/navigation";
import { requireIntroducerPage } from "../../session";
import PortalHeader from "../../PortalHeader";
import ReferralDetail from "./ReferralDetail";
import { loadOwnClient, loadOwnPayRecord } from "../../../api/introducer/_shared";
import PayTiming from "./PayTiming";
import { introducerPayTimingEnabled } from "../../../../utils/partner-pay";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Referral — Springboard Introducer Portal",
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
  // NOVA-011: off until the Springboard wording has clause-7 approval.
  const payTiming = introducerPayTimingEnabled();
  const payRecord = payTiming ? await loadOwnPayRecord(identity, id) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader firmName={identity.firmName} userName={identity.fullName ?? identity.email} />
      <main className="mx-auto max-w-3xl px-4 py-7">
        <ReferralDetail id={id} />
        {payTiming && <PayTiming stage={(record as { stage?: string | null }).stage ?? null} record={payRecord} />}
      </main>
    </div>
  );
}
