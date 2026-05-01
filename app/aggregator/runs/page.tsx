import { supabase } from "../../../utils/supabase";

export const dynamic = "force-dynamic";

function fmtDuration(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("en-AU", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800",
  running: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  partial: "bg-amber-100 text-amber-800",
  dry_run_complete: "bg-gray-100 text-gray-700",
};

export default async function RunsPage() {
  const { data: runs, error } = await supabase
    .from("ingestion_run")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(100);

  if (error) {
    return <div className="text-red-600 p-4">Error: {error.message}</div>;
  }

  const totalCost = (runs ?? []).reduce(
    (sum, r) => sum + (Number(r.ai_cost_usd) || 0),
    0,
  );
  const totalAdded = (runs ?? []).reduce(
    (sum, r) => sum + (Number(r.props_added) || 0),
    0,
  );
  const totalUpdated = (runs ?? []).reduce(
    (sum, r) => sum + (Number(r.props_updated) || 0),
    0,
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Ingestion Runs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Every email the aggregator has processed, with extraction counts and AI cost.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Stat label="Runs (last 100)" value={(runs ?? []).length.toString()} />
        <Stat label="Properties added" value={totalAdded.toString()} />
        <Stat label="Properties updated" value={totalUpdated.toString()} />
        <Stat label="Total AI cost" value={`$${totalCost.toFixed(4)}`} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Started</th>
              <th className="px-4 py-3 text-left">Builder</th>
              <th className="px-4 py-3 text-left">Email subject</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">+New</th>
              <th className="px-4 py-3 text-right">~Upd</th>
              <th className="px-4 py-3 text-right">-Wdrn</th>
              <th className="px-4 py-3 text-right">?Rev</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(runs ?? []).map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtTime(r.started_at)}</td>
                <td className="px-4 py-3 text-gray-800 font-medium">{r.builder_name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600 max-w-md truncate">{r.email_subject ?? "—"}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status] ?? "bg-gray-100"}`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-emerald-700 font-mono">{r.props_added ?? 0}</td>
                <td className="px-4 py-3 text-right text-blue-700 font-mono">{r.props_updated ?? 0}</td>
                <td className="px-4 py-3 text-right text-gray-600 font-mono">{r.props_withdrawn ?? 0}</td>
                <td className="px-4 py-3 text-right text-amber-700 font-mono">{r.props_to_review ?? 0}</td>
                <td className="px-4 py-3 text-right text-gray-600 font-mono">${Number(r.ai_cost_usd ?? 0).toFixed(4)}</td>
                <td className="px-4 py-3 text-right text-gray-500 font-mono">{fmtDuration(r.started_at, r.ended_at)}</td>
              </tr>
            ))}
            {(runs ?? []).length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-400 italic">
                  No ingestion runs yet. New ones appear here as soon as the cron processes a builder email.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <p className="text-xs text-gray-500 uppercase font-semibold mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  );
}
