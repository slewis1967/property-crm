import { supabase } from "../../utils/supabase";

export const dynamic = "force-dynamic";

const tempColor = (t: string | null) => {
  if (t === "hot") return "bg-red-100 text-red-700";
  if (t === "warm") return "bg-yellow-100 text-yellow-700";
  return "bg-blue-100 text-blue-700";
};

const matchColor = (s: string | null) => {
  if (s === "matched") return "bg-green-100 text-green-700";
  if (s === "pending") return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-600";
};

export default async function LeadsPage() {
  const { data: leads, error } = await supabase
    .from("property_leads")
    .select("*")
    .order("created_at", { ascending: false });

  const { count: hotCount } = await supabase
    .from("property_leads")
    .select("*", { count: "exact", head: true })
    .eq("temperature", "hot");

  const { count: matchedCount } = await supabase
    .from("property_leads")
    .select("*", { count: "exact", head: true })
    .eq("match_status", "matched");

  if (error) {
    return <div className="text-red-600 p-4">Error loading leads: {error.message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Leads Pipeline</h1>
          <p className="text-gray-500 text-sm mt-1">All inbound leads processed by Elvis AI triage</p>
        </div>
        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
          {leads?.length ?? 0} Total Leads
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6 sm:gap-4 sm:mb-8">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Hot Leads</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{hotCount ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Matched</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{matchedCount ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Total</p>
          <p className="text-2xl font-bold mt-1">{leads?.length ?? 0}</p>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {leads && leads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">Name</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">Email</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">Type</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">State</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">Budget</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">Score</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">Temp</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">Match</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">Top Match</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">Source</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{l.full_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{l.email || "—"}</td>
                    <td className="px-4 py-3 capitalize">{l.buyer_type || "—"}</td>
                    <td className="px-4 py-3">{l.state || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{l.budget || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{l.score ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {l.temperature ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${tempColor(l.temperature)}`}>
                          {l.temperature}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {l.match_status ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${matchColor(l.match_status)}`}>
                          {l.match_status}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">unmatched</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate">
                      {l.top_match_name ? (
                        <span title={`${l.top_match_name} — ${l.top_match_price}`}>
                          {l.top_match_name}
                          {l.top_match_price && <span className="text-gray-400"> ({l.top_match_price})</span>}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 capitalize">{l.source || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {l.created_at ? new Date(l.created_at).toLocaleDateString("en-AU") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-gray-500 font-medium mb-2">No leads yet</p>
            <p className="text-gray-400 text-sm">Submit a lead via <code className="bg-gray-100 px-1 rounded">POST /webhook/lead/facebook_form</code></p>
          </div>
        )}
      </div>
    </div>
  );
}
