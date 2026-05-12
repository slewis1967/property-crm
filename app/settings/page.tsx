import { Suspense } from "react";
import SignatureEditor from "./SignatureEditor";
import CalendarConnections from "./CalendarConnections";
import PropertyTypesEditor from "./PropertyTypesEditor";
import { getSignatureFields } from "../../utils/email-signature";
import { currentUserEmail } from "../../utils/cf-access";
import { supabase } from "../../utils/supabase";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Per-user signatures (slice + extension 2026-05-12). Server picks the
  // logged-in user as the default selection and pre-fetches their sig so
  // the editor renders fully populated on first paint.
  const owner = await currentUserEmail();
  const { data: aliasRows } = await supabase
    .from("email_user_aliases")
    .select("user_email,display_name")
    .eq("active", true)
    .order("user_email", { ascending: true });
  const users = (aliasRows ?? []).map((r) => ({
    user_email: r.user_email as string,
    display_name: (r.display_name as string | null) ?? (r.user_email as string),
  }));
  // If the current CF Access user is in the alias map, default to them.
  // Otherwise fall back to whichever user comes first in the list.
  const defaultUser = users.find((u) => u.user_email === owner)?.user_email ?? users[0]?.user_email ?? owner;
  const initial = await getSignatureFields(defaultUser);

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">CRM-wide configuration</p>
      </div>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Email signature</h2>
        <p className="text-xs text-gray-500 mb-4">
          One signature per user. Switch between Sean and Glenn at the top —
          whichever user sends a message gets their own sig auto-appended.
          Live preview on the right reflects exactly what recipients see.
        </p>
        <SignatureEditor users={users} initialUserEmail={defaultUser} initial={initial} />
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
