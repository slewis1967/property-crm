import { nexusApi } from "@/utils/nexus-api";
import { createClient } from "@supabase/supabase-js";
import AISuburbBrief from "../components/AISuburbBrief";
import { log, errInfo } from "@/utils/logger";

export const dynamic = "force-dynamic";

// Suburb intelligence lives in DuckDB — we fetch it via the NEXUS API
async function getSuburbs() {
  try {
    const res = await nexusApi("/api/suburbs", { cache: "no-store" });
    if (res.ok) return res.json();
  } catch (e) {
    log.warn("suburbs.nexus_fetch_failed", errInfo(e));
  }
  return { suburbs: [], error: "NEXUS API offline" };
}

type SuburbRow = {
  suburb: string;
  state: string;
  price_growth_pct: number | null;
  median_price: number | string | null;
  population: number | string | null;
  last_updated: string | null;
  key_infrastructure: string | null;
};

export default async function SuburbsPage() {
  const data = await getSuburbs();
  const suburbs: SuburbRow[] = data.suburbs || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Suburb Intelligence</h1>
          <p className="text-gray-500 text-sm mt-1">Enriched by Elvis AI — median prices, growth, infrastructure</p>
        </div>
        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
          {suburbs.length} Suburbs
        </span>
      </div>

      {data.error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 text-sm text-yellow-700">
          <strong>NEXUS API offline</strong> — suburb intelligence requires the NEXUS API to be running on port 8765.
          The enrichment agent runs daily at 3am and populates this data automatically.
        </div>
      )}

      {suburbs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {suburbs.map((s: SuburbRow, i: number) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-gray-900">{s.suburb}</h3>
                  <p className="text-xs text-gray-400 uppercase">{s.state}</p>
                </div>
                {s.price_growth_pct != null && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.price_growth_pct >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {s.price_growth_pct >= 0 ? "+" : ""}{s.price_growth_pct}%
                  </span>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Median Price</span>
                  <span className="font-semibold">{s.median_price ? `$${Number(s.median_price).toLocaleString()}` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Population</span>
                  <span className="font-medium">{s.population ? Number(s.population).toLocaleString() : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Updated</span>
                  <span className="text-gray-400 text-xs">
                    {s.last_updated ? new Date(s.last_updated).toLocaleDateString("en-AU") : "—"}
                  </span>
                </div>
              </div>

              {s.key_infrastructure && (() => {
                try {
                  const items = JSON.parse(s.key_infrastructure);
                  return items.length > 0 ? (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Infrastructure</p>
                      <ul className="space-y-1">
                        {items.slice(0, 3).map((item: string, j: number) => (
                          <li key={j} className="text-xs text-gray-600 flex items-start gap-1">
                            <span className="text-blue-400 mt-0.5">•</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                } catch { return null; }
              })()}

              <AISuburbBrief suburb={s.suburb} state={s.state} />
            </div>
          ))}
        </div>
      ) : !data.error ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500 font-medium">No suburb data yet</p>
          <p className="text-gray-400 text-sm mt-1">Run the enrichment agent: <code className="bg-gray-100 px-1 rounded">python3 elvis_enrichment_agent.py b1</code></p>
        </div>
      ) : null}
    </div>
  );
}
