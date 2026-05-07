import { Suspense } from "react";
import SignatureEditor from "./SignatureEditor";
import CalendarConnections from "./CalendarConnections";
import PropertyTypesEditor from "./PropertyTypesEditor";
import { getSignatureFields } from "../../utils/email-signature";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const initial = await getSignatureFields();
  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">CRM-wide configuration</p>
      </div>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Email signature</h2>
        <p className="text-xs text-gray-500 mb-4">
          Auto-appended to every outbound email sent from the CRM. Live preview on the right reflects exactly what recipients see.
        </p>
        <SignatureEditor initial={initial} />
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Calendar connections</h2>
        <p className="text-xs text-gray-500 mb-4">
          Connect each user's Google Calendar so the CRM can schedule meetings on their behalf
          directly from the opportunity page (no more bouncing to Google).
        </p>
        <Suspense fallback={<p className="text-xs text-gray-400">Loading…</p>}>
          <CalendarConnections />
        </Suspense>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Property types</h2>
        <p className="text-xs text-gray-500 mb-4">
          The list of property categories the aggregator extractor uses to classify
          newly-ingested stock. Add bespoke types like "DHA", "NRAS", or "Granny Flat"
          and they'll appear in the Aggregator Feed filter and be available to the AI
          on the next ingestion run.
        </p>
        <PropertyTypesEditor />
      </section>
    </div>
  );
}
