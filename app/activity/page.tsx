import { nexusApi } from "@/utils/nexus-api";
import { log, errInfo } from "@/utils/logger";
export const dynamic = "force-dynamic";

async function getActivity() {
  try {
    const res = await nexusApi("/api/activity", { cache: "no-store" });
    if (res.ok) return res.json();
  } catch (e) {
    log.warn("activity.nexus_fetch_failed", errInfo(e));
  }
  return { events: [], error: "NEXUS API offline" };
}

type ActivityEvent = {
  action: string;
  content_type?: string | null;
  content_preview?: string | null;
  actioned_at?: string | null;
  id?: string | number | null;
};

type PipelineRun = {
  started_at?: string | null;
  errors?: boolean | number | null;
  listings_processed?: number | null;
  content_generated?: number | null;
  research_completed?: number | null;
  posted?: number | null;
};

const actionIcon = (action: string) => {
  if (action === "approved") return "✅";
  if (action === "rejected") return "❌";
  if (action === "revision_requested") return "✏️";
  if (action === "failed") return "⚠️";
  return "📋";
};

const actionColor = (action: string) => {
  if (action === "approved") return "bg-green-50 border-green-200";
  if (action === "rejected") return "bg-red-50 border-red-200";
  if (action === "revision_requested") return "bg-yellow-50 border-yellow-200";
  if (action === "failed") return "bg-orange-50 border-orange-200";
  return "bg-gray-50 border-gray-200";
};

export default async function ActivityPage() {
  const [activityData, pipelineData] = await Promise.all([
    getActivity(),
    nexusApi("/api/pipeline", { cache: "no-store" }).then(r => r.ok ? r.json() : { runs: [] }).catch(() => ({ runs: [] })),
  ]);

  const events: ActivityEvent[] = activityData.events || [];
  const runs: PipelineRun[] = pipelineData.runs || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Activity Feed</h1>
          <p className="text-gray-500 text-sm mt-1">Elvis AI actions — approvals, content, pipeline runs</p>
        </div>
      </div>

      {activityData.error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 text-sm text-yellow-700">
          <strong>NEXUS API offline</strong> — start with <code>bash /mnt/c/NEXUS-Memory/start-nexus.sh</code>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Content Approvals */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Content Approvals</h2>
            {events.length > 0 ? (
              <div className="space-y-3">
                {events.map((e: ActivityEvent, i: number) => (
                  <div key={i} className={`border rounded-lg p-4 ${actionColor(e.action)}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        <span className="text-lg">{actionIcon(e.action)}</span>
                        <div>
                          <p className="text-sm font-medium capitalize">{e.action.replace(/_/g, " ")}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{e.content_type || "Content"}</p>
                          {e.content_preview && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{e.content_preview}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-xs text-gray-400">
                          {e.actioned_at ? new Date(e.actioned_at).toLocaleDateString("en-AU") : "—"}
                        </p>
                        <p className="text-xs text-gray-300">{e.id}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No content approval history yet. Approve or reject content via Telegram to see activity here.</p>
            )}
          </div>
        </div>

        {/* Pipeline Runs */}
        <div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Pipeline Runs</h2>
            {runs.length > 0 ? (
              <div className="space-y-3">
                {runs.map((r: PipelineRun, i: number) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-gray-500">
                        {r.started_at ? new Date(r.started_at).toLocaleDateString("en-AU") : "—"}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.errors ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                        {r.errors ? "errors" : "ok"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
                      <span>Scraped: <b>{r.listings_processed ?? 0}</b></span>
                      <span>Content: <b>{r.content_generated ?? 0}</b></span>
                      <span>Research: <b>{r.research_completed ?? 0}</b></span>
                      <span>Posted: <b>{r.posted ?? 0}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">No pipeline runs yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
