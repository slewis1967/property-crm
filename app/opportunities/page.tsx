import { nexusApi } from "@/utils/nexus-api";
import KanbanBoard, { type Lead, type Pipeline } from "./KanbanBoard";

export const dynamic = "force-dynamic";

async function getLeads(): Promise<Lead[]> {
  try {
    const res = await nexusApi("/api/leads", { cache: "no-store" });
    if (res.ok) return (await res.json()).leads || [];
  } catch {}
  return [];
}

async function getPipelines(): Promise<Pipeline[]> {
  try {
    const res = await nexusApi("/api/pipelines", { cache: "no-store" });
    if (res.ok) return (await res.json()).pipelines || [];
  } catch {}
  return [];
}

export default async function OpportunitiesPage() {
  const [leads, pipelines] = await Promise.all([getLeads(), getPipelines()]);

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

      {leads.length === 0 && pipelines.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-sm text-yellow-700">
          NEXUS API offline — start with <code>bash /mnt/c/NEXUS-Memory/start-nexus.sh</code>
        </div>
      )}

      <KanbanBoard initialLeads={leads} initialPipelines={pipelines} />
    </div>
  );
}
