import { nexusApi } from "@/utils/nexus-api";
import { supabase } from "../../utils/supabase";
import { createClient } from "@supabase/supabase-js";
import { log, errInfo } from "@/utils/logger";

export const dynamic = "force-dynamic";

async function getPendingContent() {
  try {
    const res = await nexusApi("/api/approvals/pending", { cache: "no-store" });
    if (res.ok) return res.json();
  } catch (e) {
    log.warn("approvals.nexus_fetch_failed", errInfo(e));
  }
  return { pending: [] };
}

type PendingContent = {
  content_type?: string | null;
  id?: string | number | null;
  content?: string | null;
};

type ApprovalHistory = {
  action: string;
  content_type?: string | null;
  id?: string | number | null;
  actioned_at?: string | null;
};

const actionIcon = (action: string) => {
  if (action === "approved") return "✅";
  if (action === "rejected") return "❌";
  if (action === "revision_requested") return "✏️";
  if (action === "failed") return "⚠️";
  return "📋";
};

const actionBg = (action: string) => {
  if (action === "approved") return "bg-green-50 border-green-200 text-green-700";
  if (action === "rejected") return "bg-red-50 border-red-200 text-red-700";
  if (action === "revision_requested") return "bg-yellow-50 border-yellow-200 text-yellow-700";
  return "bg-gray-50 border-gray-200 text-gray-600";
};

export default async function ApprovalsPage() {
  const [pendingData, { data: history }] = await Promise.all([
    getPendingContent(),
    supabase
      .from("content_approvals")
      .select("*")
      .order("actioned_at", { ascending: false })
      .limit(50),
  ]);

  const pending: PendingContent[] = pendingData.pending || [];

  return (
    <div>
      <div className="flex justify-between items-start sm:items-center mb-6 lg:mb-8 gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-bold">Approval Queue</h1>
          <p className="text-gray-500 text-sm mt-1">Content pending review via Telegram · Tap ✅ ❌ ✏️ in Telegram to action</p>
        </div>
        {pending.length > 0 && (
          <span className="bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full animate-pulse whitespace-nowrap flex-shrink-0">
            {pending.length} Pending
          </span>
        )}
      </div>

      {/* Pending Queue */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">
          Pending Approval
          {pending.length > 0 && <span className="ml-2 text-sm text-orange-600">({pending.length})</span>}
        </h2>
        {pending.length > 0 ? (
          <div className="space-y-3">
            {pending.map((p: PendingContent, i: number) => (
              <div key={i} className="border border-orange-200 bg-orange-50 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold capitalize">{p.content_type || "Content"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">ID: {p.id}</p>
                    {p.content && (
                      <p className="text-xs text-gray-600 mt-2 line-clamp-3 whitespace-pre-wrap">{p.content}</p>
                    )}
                  </div>
                  <span className="text-xs text-orange-600 font-medium whitespace-nowrap ml-4">⏳ Awaiting</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-2xl mb-2">✅</p>
            <p className="text-gray-500 font-medium">Queue is clear</p>
            <p className="text-gray-400 text-sm mt-1">No content waiting for approval</p>
          </div>
        )}
      </div>

      {/* Approval History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Approval History</h2>
        {history && history.length > 0 ? (
          <div className="space-y-2">
            {history.map((h: ApprovalHistory, i: number) => (
              <div key={i} className={`border rounded-lg px-4 py-3 flex justify-between items-center ${actionBg(h.action)}`}>
                <div className="flex items-center gap-3">
                  <span>{actionIcon(h.action)}</span>
                  <div>
                    <p className="text-sm font-medium capitalize">{h.action.replace(/_/g, " ")}</p>
                    <p className="text-xs opacity-70">{h.content_type || "—"} · ID: {h.id}</p>
                  </div>
                </div>
                <div className="text-right text-xs opacity-60">
                  {h.actioned_at ? new Date(h.actioned_at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No approval history yet. Content approved or rejected via Telegram will appear here.</p>
        )}
      </div>
    </div>
  );
}
