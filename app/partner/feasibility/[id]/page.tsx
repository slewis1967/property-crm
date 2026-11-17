import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Frame from "../../Frame";
import { has, requirePartnerPage } from "../../session";
import { supabase } from "../../../../utils/supabase";
import { BUSINESS_TIME_ZONE } from "../../../../utils/datetime";
import type { FeasibilityReport } from "../../../components/FeasibilityReportBody";
import PartnerReport from "../PartnerReport";
import ReportWaiting from "./ReportWaiting";
import { feasibilityView } from "../../../../utils/partner-feasibility";

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
    .select("id,address,report,status,error,created_at,job_started_at,partner_users(full_name)")
    .eq("id", id)
    .eq("partner_id", identity.partnerId)
    .maybeSingle();
  if (!data) notFound();

  const view = feasibilityView(data);
  if (view.status !== "ready" || !data.report) {
    return (
      <Frame identity={identity}>
        <Link href="/partner/feasibility" className="text-sm text-gray-600 hover:text-gray-900">← All reports</Link>
        <div className="mt-3 max-w-2xl">
          {view.status === "failed" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{view.error}</div>
          ) : (
            <ReportWaiting id={data.id} address={data.address} />
          )}
        </div>
      </Frame>
    );
  }

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
