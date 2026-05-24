import { supabase } from "../utils/supabase";
import WarRoomCalculators from "./components/WarRoomCalculators";
import AIDashboardBrief from "./components/AIDashboardBrief";

export const dynamic = "force-dynamic";

const tempColor = (t: string | null) => {
  if (t === "hot") return "bg-red-100 text-red-700";
  if (t === "warm") return "bg-yellow-100 text-yellow-700";
  return "bg-blue-100 text-blue-700";
};

const statusColor = (s: string | null) => {
  if (s === "matched") return "bg-green-100 text-green-700";
  if (s === "new") return "bg-gray-100 text-gray-600";
  if (s === "contacted") return "bg-blue-100 text-blue-700";
  return "bg-purple-100 text-purple-700";
};

export default async function Home() {
  let leadsCount = 0, propertiesCount = 0, contactsCount = 0;
  let hotLeads: Record<string, unknown>[] = [], recentLeads: Record<string, unknown>[] = [], recentContacts: Record<string, unknown>[] = [];
  let dataFetchError = false;

  try {
    const results = await Promise.all([
      supabase.from("property_leads").select("*", { count: "exact", head: true }),
      supabase.from("global_stock_pool").select("*", { count: "exact", head: true }),
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase.from("contacts").select("name,email,temperature,lead_score,status").eq("temperature", "hot").order("created_at", { ascending: false }).limit(5),
      supabase.from("property_leads").select("full_name,email,state,buyer_type,temperature,score,match_status,created_at").order("created_at", { ascending: false }).limit(8),
      supabase.from("contacts").select("name,email,buyer_type,temperature,lead_score,status,preferred_state,created_at").order("created_at", { ascending: false }).limit(10),
    ]);

    leadsCount = results[0].count ?? 0;
    propertiesCount = results[1].count ?? 0;
    contactsCount = results[2].count ?? 0;
    hotLeads = results[3].data ?? [];
    recentLeads = results[4].data ?? [];
    recentContacts = results[5].data ?? [];
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
    dataFetchError = true;
  }

  return (
    <div>
      {dataFetchError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-red-600 mb-2">
              Unable to load dashboard data
            </h2>
            <p className="text-gray-600 mb-4">
              The War Room could not load some data. This may be a temporary
              issue. Please try again later or contact support if the problem
              persists.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#0F4C5C] text-white rounded-md hover:bg-[#0B3D4A] transition"
            >
              Try again
            </button>
          </div>
        </div>
      )}
      <div className="relative z-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">War Room</h1>
            <p className="text-gray-500 text-sm mt-1">NextKey Property Strategists — Elvis AI Command Centre</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-sm text-gray-500">Elvis Online</span>
          </div>
        </div>
      </div>

      <AIDashboardBrief />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Total Leads</h3>
          <p className="text-3xl font-bold mt-2">{leadsCount ?? 0}</p>
          <a href="/leads" className="text-xs text-blue-600 mt-2 block hover:underline">View pipeline →</a>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Contacts (CRM)</h3>
          <p className="text-3xl font-bold mt-2">{contactsCount ?? 0}</p>
          <a href="/contacts" className="text-xs text-blue-600 mt-2 block hover:underline">View contacts →</a>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Stock Pool</h3>
          <p className="text-3xl font-bold mt-2">{propertiesCount ?? 0}</p>
          <a href="/properties" className="text-xs text-blue-600 mt-2 block hover:underline">View properties →</a>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Hot Leads</h3>
          <p className="text-3xl font-bold mt-2 text-red-600">{hotLeads?.length ?? 0}</p>
          <a href="/leads?filter=hot" className="text-xs text-red-500 mt-2 block hover:underline">View hot leads →</a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Recent Leads */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Recent Leads</h2>
            <a href="/leads" className="text-sm text-blue-600 hover:underline">View all</a>
          </div>
          {recentLeads && recentLeads.length > 0 ? (
            <div className="space-y-3">
              {recentLeads.map((l: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{l.full_name || "—"}</p>
                    <p className="text-xs text-gray-400">{l.buyer_type || "—"} · {l.state || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.temperature && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${tempColor(l.temperature)}`}>
                        {l.temperature}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">#{l.score ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No leads yet.</p>
          )}
        </div>

        {/* Hot Contacts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Hot Contacts</h2>
            <a href="/contacts" className="text-sm text-blue-600 hover:underline">View all</a>
          </div>
          {hotLeads && hotLeads.length > 0 ? (
            <div className="space-y-3">
              {hotLeads.map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{c.name || "—"}</p>
                    <p className="text-xs text-gray-400">{c.email || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">🔥 hot</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(c.status)}`}>
                      {c.status || "new"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No hot contacts yet.</p>
          )}
        </div>
      </div>

      {/* Recent Contacts Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Recent Contacts</h2>
          <a href="/contacts" className="text-sm text-blue-600 hover:underline">View all</a>
        </div>
        {recentContacts && recentContacts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Name</th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Email</th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Type</th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">State</th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Temp</th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Score</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentContacts.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium">{c.name || "—"}</td>
                    <td className="py-2 pr-4 text-gray-500">{c.email || "—"}</td>
                    <td className="py-2 pr-4 capitalize">{c.buyer_type || "—"}</td>
                    <td className="py-2 pr-4">{c.preferred_state || "—"}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${tempColor(c.temperature)}`}>
                        {c.temperature || "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{c.lead_score ?? "—"}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(c.status)}`}>
                        {c.status || "new"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">
            No contacts yet. Submit a lead via /webhook/lead/facebook_form to see data here.
          </p>
        )}
      </div>

      <WarRoomCalculators />
    </div>
  );
}