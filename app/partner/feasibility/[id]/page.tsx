import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Frame from "../../Frame";
import { has, requirePartnerPage } from "../../session";
import { supabase } from "../../../../utils/supabase";
import { BUSINESS_TIME_ZONE } from "../../../../utils/datetime";
import type { FeasibilityReport } from "../../../components/FeasibilityReportBody";
import PartnerReport from "../PartnerReport";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feasibility report — Partner Portal" };

/** One saved report. Filtered on the session's firm: another firm's id is a 404. */
export default async function PartnerFeasibilityReportPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePartnerPage();
  if (!has(identity, "feasibility")) redirect("/partner/account");

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await supabase
    .from("partner_feasibility_reports")
    .select("id,address,report,created_at,partner_users(full_name)")
    .eq("id", id)
    .eq("partner_id", identity.partnerId)
    .eq("status", "ready")
    .maybeSingle();
  if (!data) notFound();

  const by = Array.isArray(data.partner_users) ? data.partner_users[0] : data.partner_users;
  const dateLabel = new Date(data.created_at).toLocaleDateString("en-AU", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Frame identity={identity}>
      <Link href="/partner/feasibility" className="no-print text-sm text-gray-600 hover:text-gray-900">← All reports</Link>
      <div className="mt-3">
        <PartnerReport
          report={data.report as FeasibilityReport}
          address={data.address}
          branding={identity.branding}
          firmName={identity.firmName}
          preparedBy={(by as { full_name?: string | null } | null)?.full_name ?? ""}
          dateLabel={dateLabel}
        />
      </div>
    </Frame>
  );
}
