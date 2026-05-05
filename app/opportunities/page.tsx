import Link from "next/link";
import { nexusApi } from "@/utils/nexus-api";
import { supabase } from "../../utils/supabase";
import KanbanBoard, { type Lead, type Pipeline } from "./KanbanBoard";
import { fmtDate, fmtCurrency } from "../../utils/archive-helpers";

export const dynamic = "force-dynamic";

const ARCHIVE_LIMIT = 50;

const archiveStatusColor = (s: string | null) => {
  if (!s) return "bg-gray-100 text-gray-600";
  const k = s.toLowerCase();
  if (k === "won") return "bg-green-100 text-green-700";
  if (k === "lost") return "bg-red-100 text-red-700";
  if (k === "open") return "bg-blue-100 text-blue-700";
  if (k === "abandoned") return "bg-gray-100 text-gray-600";
  return "bg-purple-100 text-purple-700";
};

async function getLeads(): Promise<{ leads: Lead[]; error: string | null }> {
  try {
    const res = await nexusApi("/api/leads", { cache: "no-store" });
    if (res.ok) return { leads: (await res.json()).leads || [], error: null };
    return { leads: [], error: `NEXUS API responded ${res.status}` };
  } catch (e: any) {
    return { leads: [], error: e?.message || "Couldn't reach NEXUS API" };
  }
}

async function getPipelines(): Promise<{ pipelines: Pipeline[]; error: string | null }> {
  try {
    const res = await nexusApi("/api/pipelines", { cache: "no-store" });
    if (res.ok) return { pipelines: (await res.json()).pipelines || [], error: null };
    return { pipelines: [], error: `NEXUS API responded ${res.status}` };
  } catch (e: any) {
    return { pipelines: [], error: e?.message || "Couldn't reach NEXUS API" };
  }
}

async function getArchiveOpps() {
  const { data, count } = await supabase
    .from("ghl_archive_opportunities")
    .select("id,name,contact_id,pipeline_id,pipeline_stage_id,status,monetary_value,date_added", {
      count: "exact",
    })
    .order("date_added", { ascending: false, nullsFirst: false })
    .limit(ARCHIVE_LIMIT);

  const opps = data ?? [];
  const total = count ?? 0;
  if (opps.length === 0) return { opps: [], total: 0, pipeName: {}, stageName: {} };

  const pipelineIds = Array.from(new Set(opps.map((o: any) => o.pipeline_id).filter(Boolean)));
  const stageIds = Array.from(new Set(opps.map((o: any) => o.pipeline_stage_id).filter(Boolean)));
  const [{ data: pipelines }, { data: stages }] = await Promise.all([
    pipelineIds.length > 0
      ? supabase.from("ghl_archive_pipelines").select("id,name").in("id", pipelineIds)
      : Promise.resolve({ data: [] as any[] }),
    stageIds.length > 0
      ? supabase.from("ghl_archive_pipeline_stages").select("id,name").in("id", stageIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const pipeName: Record<string, string> = Object.fromEntries(
    (pipelines ?? []).map((p: any) => [p.id, p.name])
  );
  const stageName: Record<string, string> = Object.fromEntries(
    (stages ?? []).map((s: any) => [s.id, s.name])
  );

  return { opps, total, pipeName, stageName };
}

export default async function OpportunitiesPage() {
  const [leadsResult, pipelinesResult, archive] = await Promise.all([
    getLeads(),
    getPipelines(),
    getArchiveOpps(),
  ]);

  const { leads, error: leadsError } = leadsResult;
  const { pipelines, error: pipelinesError } = pipelinesResult;
  const apiError = pipelinesError || leadsError;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold">Opportunities</h1>
          <p className="text-gray-500 text-sm mt-1">
            Drag cards · Elvis AI auto-advances · syncs every 8s
          </p>
        </div>
        <a href="/leads" className="text-sm text-blue-600 hover:underline">Table view →</a>
      </div>

      {apiError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
          <div className="font-semibold mb-1">Couldn't load opportunities from NEXUS API</div>
          <div className="text-xs text-red-600 font-mono">{apiError}</div>
          <div className="text-xs text-red-500 mt-2">Reload the page once the API is reachable.</div>
        </div>
      )}

      <KanbanBoard initialLeads={leads} initialPipelines={pipelines} />

      {archive.opps.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">GHL Archive · Opportunities</h2>
            <span className="text-xs text-gray-400">
              showing {archive.opps.length} of {archive.total.toLocaleString()}
            </span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Name</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Pipeline · Stage</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Contact</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Status</th>
                  <th className="text-right py-2 px-4 text-gray-500 font-medium">Value</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {archive.opps.map((o: any) => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4 font-medium">{o.name || "—"}</td>
                    <td className="py-2 px-4 text-gray-600 text-xs">
                      {archive.pipeName[o.pipeline_id] || "—"}
                      <br />
                      <span className="text-gray-400">{archive.stageName[o.pipeline_stage_id] || "—"}</span>
                    </td>
                    <td className="py-2 px-4">
                      {o.contact_id ? (
                        <Link href={`/contacts/${o.contact_id}`} className="text-blue-600 hover:underline text-xs">
                          view contact →
                        </Link>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${archiveStatusColor(o.status)}`}>
                        {o.status || "—"}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right font-mono">{fmtCurrency(Number(o.monetary_value))}</td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{fmtDate(o.date_added)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
