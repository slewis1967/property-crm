import { supabase } from "../../utils/supabase";
import { fetchAllRows } from "../../utils/supabase-paginate";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_AGO = () => new Date(Date.now() - 7 * 86400000).toISOString();
const THIRTY_DAYS_AGO = () => new Date(Date.now() - 30 * 86400000).toISOString();

export default async function AnalyticsPage() {
  const sevenDays = SEVEN_DAYS_AGO();
  const thirtyDays = THIRTY_DAYS_AGO();

  const [
    { data: leads },
    { data: runs7d },
    { data: stockPool },
    { data: sms30d },
    { count: optOutCount },
    { data: enrollments },
    { data: steps7d },
    { data: recs },
  ] = await Promise.all([
    // Paginated: these grow unbounded and feed in-JS aggregations — a
    // silent 1000-row cap would freeze every chart once the table passes
    // it (one all-contacts broadcast alone clears it on enrollments).
    fetchAllRows((from, to) =>
      supabase
        .from("property_leads")
        .select("triage_score,buyer_type,state,match_status,created_at")
        .range(from, to),
    ),
    supabase
      .from("ingestion_run")
      .select("started_at,builder_name,email_subject,status,props_added,props_updated,props_to_review,ai_cost_usd")
      .gte("started_at", sevenDays)
      .order("started_at", { ascending: false }),
    fetchAllRows((from, to) =>
      supabase.from("global_stock_pool").select("pipeline_status").range(from, to),
    ),
    supabase
      .from("sms_log")
      .select("status,campaign,cost,sent_at")
      .gte("sent_at", thirtyDays),
    supabase
      .from("sms_opt_outs")
      .select("*", { count: "exact", head: true }),
    fetchAllRows((from, to) =>
      supabase.from("sequence_enrollments").select("status").range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("sequence_step_runs")
        .select("status,run_at")
        .gte("run_at", sevenDays)
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("recommendation_log")
        .select("status,impact,applied_at,created_at")
        .range(from, to),
    ),
  ]);

  // ── Lead Intelligence ──
  const byTemp = { hot: 0, warm: 0, cold: 0 };
  const byState: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let matchedCount = 0;
  let totalScore = 0;
  let scoredCount = 0;
  for (const l of leads || []) {
    // property_leads has no temperature column — bucket by triage_score.
    if (l.triage_score >= 50) byTemp.hot++;
    else if (l.triage_score >= 35) byTemp.warm++;
    else byTemp.cold++;
    if (l.state) byState[l.state] = (byState[l.state] || 0) + 1;
    if (l.buyer_type) byType[l.buyer_type] = (byType[l.buyer_type] || 0) + 1;
    if (l.match_status === "matched") matchedCount++;
    if (l.triage_score) { totalScore += l.triage_score; scoredCount++; }
  }
  const matchRate = leads?.length ? Math.round((matchedCount / leads.length) * 100) : 0;
  const avgScore = scoredCount ? Math.round(totalScore / scoredCount) : 0;
  const topStates = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── Aggregator Pipeline ──
  const runsCount7d = runs7d?.length ?? 0;
  const propsAdded7d = (runs7d ?? []).reduce((s, r) => s + (r.props_added || 0), 0);
  const propsUpdated7d = (runs7d ?? []).reduce((s, r) => s + (r.props_updated || 0), 0);
  const aiCost7d = (runs7d ?? []).reduce((s, r) => s + Number(r.ai_cost_usd || 0), 0);
  const stockByStatus: Record<string, number> = {};
  for (const p of stockPool || []) {
    const k = p.pipeline_status || "unknown";
    stockByStatus[k] = (stockByStatus[k] || 0) + 1;
  }
  const liveProps = (stockByStatus.active || 0) + (stockByStatus.pending_review || 0);
  const recentRuns = (runs7d ?? []).slice(0, 12);

  // ── Outreach ──
  type SmsStatus = "sent" | "queued" | "failed" | "opted_out";
  const smsByStatus: Record<SmsStatus, number> = { sent: 0, queued: 0, failed: 0, opted_out: 0 };
  let smsCost30d = 0;
  for (const s of sms30d || []) {
    const status = s.status as SmsStatus;
    if (status === "sent" || status === "queued" || status === "failed" || status === "opted_out") {
      smsByStatus[status]++;
    }
    smsCost30d += Number(s.cost || 0);
  }
  const seqByStatus: Record<string, number> = {};
  for (const e of enrollments || []) {
    const k = e.status || "unknown";
    seqByStatus[k] = (seqByStatus[k] || 0) + 1;
  }
  const stepsByStatus: Record<string, number> = {};
  for (const r of steps7d || []) {
    const k = r.status || "unknown";
    stepsByStatus[k] = (stepsByStatus[k] || 0) + 1;
  }

  // ── Advisor ──
  const recByImpact = { high: 0, medium: 0, low: 0 };
  let pending = 0, applied = 0, dismissed = 0, snoozed = 0, appliedThisWeek = 0;
  for (const r of recs || []) {
    if (r.status === "pending") {
      pending++;
      const k = (r.impact || "low") as keyof typeof recByImpact;
      if (k in recByImpact) recByImpact[k]++;
    } else if (r.status === "applied") {
      applied++;
      if (r.applied_at && r.applied_at >= sevenDays) appliedThisWeek++;
    } else if (r.status === "dismissed") dismissed++;
    else if (r.status === "snoozed") snoozed++;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">Leads, aggregator pipeline, outreach, and advisor activity</p>
      </div>

      {/* ─────── Lead Intelligence ─────── */}
      <h2 className="text-lg font-semibold mb-4">Lead Intelligence</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Leads" value={leads?.length ?? 0} />
        <Kpi label="Match Rate" value={`${matchRate}%`} sub={`${matchedCount} matched`} valueClass="text-green-600" />
        <Kpi label="Avg Score" value={avgScore} sub="out of 100" />
        <Kpi label="Hot Leads" value={byTemp.hot} sub={`${byTemp.warm} warm · ${byTemp.cold} cold`} valueClass="text-red-600" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <BarCard title="Leads by State" rows={topStates} total={leads?.length || 1} barClass="bg-blue-500" />
        <BarCard title="Leads by Buyer Type" rows={topTypes} total={leads?.length || 1} barClass="bg-purple-500" />
      </div>

      {/* ─────── Aggregator Pipeline ─────── */}
      <h2 className="text-lg font-semibold mb-4">Aggregator Pipeline <span className="text-xs text-gray-400 font-normal">(last 7 days)</span></h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Kpi label="Live Properties" value={liveProps} sub={`${stockByStatus.legacy || 0} legacy`} />
        <Kpi label="Runs" value={runsCount7d} />
        <Kpi label="Props Added" value={propsAdded7d} sub={`~${propsUpdated7d} updated`} valueClass="text-green-600" />
        <Kpi label="AI Cost" value={`$${aiCost7d.toFixed(2)}`} sub="USD" />
        <Kpi label="Pending Review" value={stockByStatus.pending_review || 0} sub="needs human eyes" valueClass={(stockByStatus.pending_review || 0) > 0 ? "text-amber-600" : ""} />
      </div>
      {recentRuns.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-10">
          <h3 className="font-semibold text-gray-800 mb-4">Recent Ingestion Runs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  <th className="text-left py-2 pr-4 text-gray-400 font-medium">When</th>
                  <th className="text-left py-2 pr-4 text-gray-400 font-medium">Builder</th>
                  <th className="text-left py-2 pr-4 text-gray-400 font-medium">Status</th>
                  <th className="text-right py-2 pr-4 text-gray-400 font-medium">+ Added</th>
                  <th className="text-right py-2 pr-4 text-gray-400 font-medium">~ Updated</th>
                  <th className="text-right py-2 text-gray-400 font-medium">AI $</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-500 text-xs whitespace-nowrap">{r.started_at ? new Date(r.started_at).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="py-2 pr-4 truncate max-w-xs">{r.builder_name || "—"}</td>
                    <td className="py-2 pr-4"><StatusPill status={r.status} /></td>
                    <td className="py-2 pr-4 text-right">{r.props_added ?? 0}</td>
                    <td className="py-2 pr-4 text-right">{r.props_updated ?? 0}</td>
                    <td className="py-2 text-right text-xs text-gray-500">{Number(r.ai_cost_usd || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-10 text-sm text-gray-500">No ingestion runs in the last 7 days.</div>
      )}

      {/* ─────── Outreach ─────── */}
      <h2 className="text-lg font-semibold mb-4">Outreach</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="SMS Sent (30d)" value={smsByStatus.sent} sub={`${smsByStatus.failed} failed`} />
        <Kpi label="SMS Cost (30d)" value={`$${smsCost30d.toFixed(2)}`} sub="AUD" />
        <Kpi label="SMS Opt-Outs" value={optOutCount ?? 0} sub="all-time" valueClass={(optOutCount ?? 0) > 0 ? "text-amber-600" : ""} />
        <Kpi label="Active Sequences" value={seqByStatus.active || 0} sub={`${seqByStatus.completed || 0} completed`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Sequence Enrollments by Status</h3>
          <BreakdownList rows={Object.entries(seqByStatus).sort((a, b) => b[1] - a[1])} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Sequence Step Runs <span className="text-xs text-gray-400 font-normal">(last 7d)</span></h3>
          <BreakdownList rows={Object.entries(stepsByStatus).sort((a, b) => b[1] - a[1])} />
        </div>
      </div>

      {/* ─────── Advisor ─────── */}
      <h2 className="text-lg font-semibold mb-4">Advisor Activity</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="Pending" value={pending} sub={`${recByImpact.high} high · ${recByImpact.medium} med · ${recByImpact.low} low`} valueClass={pending > 0 ? "text-amber-600" : ""} />
        <Kpi label="Applied This Week" value={appliedThisWeek} valueClass="text-green-600" />
        <Kpi label="Applied (all-time)" value={applied} />
        <Kpi label="Dismissed" value={dismissed} sub={`${snoozed} snoozed`} />
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, valueClass = "" }: { label: string; value: string | number; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
      <p className="text-xs text-gray-500 uppercase font-semibold">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function BarCard({ title, rows, total, barClass }: { title: string; rows: [string, number][]; total: number; barClass: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h3 className="font-semibold text-gray-800 mb-4">{title}</h3>
      {rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map(([label, count]) => {
            const pct = Math.round((count / total) * 100);
            return (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium capitalize">{label}</span>
                  <span className="text-gray-500">{count} ({pct}%)</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full">
                  <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className="text-gray-400 text-sm">No data yet</p>}
    </div>
  );
}

function BreakdownList({ rows }: { rows: [string, number][] }) {
  if (rows.length === 0) return <p className="text-gray-400 text-sm">No data yet</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map(([k, v]) => (
        <li key={k} className="flex justify-between border-b border-gray-50 pb-1.5">
          <span className="capitalize">{k.replace(/_/g, " ")}</span>
          <span className="font-semibold">{v}</span>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const s = status || "unknown";
  const cls =
    s === "completed" ? "bg-green-100 text-green-700" :
    s === "failed" ? "bg-red-100 text-red-700" :
    s === "skipped_draft" ? "bg-gray-100 text-gray-500" :
    s === "running" ? "bg-blue-100 text-blue-700" :
    "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{s.replace(/_/g, " ")}</span>;
}
