import Link from "next/link";
import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import { feasibilityUsedThisMonth, listFeasibilityReports } from "../../../utils/partner-feasibility-db";
import { formatDateTime } from "../../../utils/datetime";
import { monthlyAllowance } from "../../../utils/partner-feasibility";
import FeasibilityTool from "./FeasibilityTool";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feasibility — Partner Portal" };

export default async function PartnerFeasibilityPage() {
  const identity = await requirePartnerPage();
  if (!has(identity, "feasibility")) redirect("/partner/account");

  const [reports, usedCount] = await Promise.all([
    listFeasibilityReports(identity.partnerId),
    feasibilityUsedThisMonth(identity.partnerId),
  ]);
  const used = usedCount ?? 0;
  const allowance = monthlyAllowance();

  return (
    <Frame identity={identity}>
      <h1 className="text-2xl font-semibold text-gray-900">Planning feasibility</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        A preliminary planning report for your client&apos;s own site anywhere in Australia: zone, controls, subdivision
        and extra-dwelling potential, constraints and next steps, in your letterhead. {used} of {allowance} used this month.
      </p>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold text-gray-900">New assessment</h2>
          <FeasibilityTool accent={identity.branding.accentColor} remaining={allowance - used} />
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-gray-900">Your reports</h2>
          {reports.length === 0 ? (
            <p className="text-sm text-gray-600">None yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {reports.map((r) => (
                <li key={r.id} className="px-4 py-3 text-sm">
                  <Link href={`/partner/feasibility/${r.id}`} className="font-medium underline">{r.address}</Link>
                  <div className="text-xs text-gray-500">{formatDateTime(r.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Frame>
  );
}
