import Link from "next/link";
import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import { feasibilityUsedThisMonth, listFeasibilityReports } from "../../../utils/partner-feasibility-db";
import { formatDateTime } from "../../../utils/datetime";
import { feasibilityView, monthlyAllowance } from "../../../utils/partner-feasibility";
import { BRAND, Card, CardTitle, Icon, PageHeader, brandTint } from "../ui";
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
  const pct = Math.min(100, Math.round((used / Math.max(1, allowance)) * 100));

  return (
    <Frame identity={identity}>
      <PageHeader
        eyebrow="Enterprise tool"
        title="Planning feasibility"
        icon="layers"
        subtitle="A preliminary planning report for your client's own site anywhere in Australia: zone, controls, subdivision and extra-dwelling potential, constraints and next steps, in your letterhead."
        actions={
          <div className="min-w-48 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-semibold uppercase tracking-wide text-slate-500">This month</span>
              <span className="font-bold text-slate-900">{used} / {allowance}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BRAND }} />
            </div>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <Card>
            <CardTitle icon="sparkle">New assessment</CardTitle>
            <FeasibilityTool accent={identity.branding.accentColor} remaining={allowance - used} />
          </Card>
        </section>
        <section className="lg:col-span-2">
          <Card>
            <CardTitle icon="doc" aside={<span className="text-xs font-medium text-slate-500">{reports.length}</span>}>Your reports</CardTitle>
            {reports.length === 0 ? (
              <p className="text-sm text-slate-500">None yet. Your finished reports will be listed here.</p>
            ) : (
              <ul className="-mx-2 space-y-1">
                {reports.map((r) => {
                  const v = feasibilityView(r);
                  return (
                    <li key={r.id}>
                      <Link href={`/partner/feasibility/${r.id}`} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: brandTint(9), color: BRAND }}>
                          <Icon name="doc" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900 group-hover:underline">{r.address}</span>
                          <span className="block text-xs text-slate-500">{formatDateTime(r.created_at)}</span>
                        </span>
                        {v.status === "pending" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Writing</span>}
                        {v.status === "failed" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">Failed</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </Frame>
  );
}
