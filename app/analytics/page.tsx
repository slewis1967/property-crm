import { supabase } from "../../utils/supabase";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [
    { data: leads },
    { data: contacts },
    { data: fbPosts },
    { data: socialPosts },
    { data: contentApprovals },
  ] = await Promise.all([
    supabase.from("property_leads").select("temperature,buyer_type,state,score,match_status,created_at"),
    supabase.from("contacts").select("temperature,buyer_type,status,lead_score,created_at"),
    supabase.from("fb_post_performance").select("likes,comments,shares,reach,posted_at").order("posted_at", { ascending: false }).limit(20),
    supabase.from("social_posts").select("content_type,fb_success,ig_success,posted_at").order("posted_at", { ascending: false }).limit(50),
    supabase.from("content_approvals").select("action,content_type,actioned_at").order("actioned_at", { ascending: false }).limit(100),
  ]);

  // Lead calculations
  const byTemp = { hot: 0, warm: 0, cold: 0 };
  const byState: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let matchedCount = 0;
  let totalScore = 0;
  let scoredCount = 0;

  for (const l of leads || []) {
    if (l.temperature === "hot") byTemp.hot++;
    else if (l.temperature === "warm") byTemp.warm++;
    else byTemp.cold++;
    if (l.state) byState[l.state] = (byState[l.state] || 0) + 1;
    if (l.buyer_type) byType[l.buyer_type] = (byType[l.buyer_type] || 0) + 1;
    if (l.match_status === "matched") matchedCount++;
    if (l.score) { totalScore += l.score; scoredCount++; }
  }

  const matchRate = leads?.length ? Math.round((matchedCount / leads.length) * 100) : 0;
  const avgScore = scoredCount ? Math.round(totalScore / scoredCount) : 0;

  // FB performance
  const totalReach = fbPosts?.reduce((s, p) => s + (p.reach || 0), 0) || 0;
  const totalLikes = fbPosts?.reduce((s, p) => s + (p.likes || 0), 0) || 0;
  const totalComments = fbPosts?.reduce((s, p) => s + (p.comments || 0), 0) || 0;

  // Approval rate
  const approved = contentApprovals?.filter(a => a.action === "approved").length || 0;
  const rejected = contentApprovals?.filter(a => a.action === "rejected").length || 0;
  const approvalRate = (approved + rejected) > 0 ? Math.round((approved / (approved + rejected)) * 100) : 0;

  const topStates = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">Performance overview across leads, content, and social</p>
      </div>

      {/* Lead Analytics */}
      <h2 className="text-lg font-semibold mb-4">Lead Intelligence</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Total Leads</p>
          <p className="text-3xl font-bold mt-1">{leads?.length ?? 0}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Match Rate</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{matchRate}%</p>
          <p className="text-xs text-gray-400 mt-1">{matchedCount} matched</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Avg Score</p>
          <p className="text-3xl font-bold mt-1">{avgScore}</p>
          <p className="text-xs text-gray-400 mt-1">out of 100</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Hot Leads</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{byTemp.hot}</p>
          <p className="text-xs text-gray-400 mt-1">{byTemp.warm} warm · {byTemp.cold} cold</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* By State */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Leads by State</h3>
          {topStates.length > 0 ? (
            <div className="space-y-3">
              {topStates.map(([state, count]) => {
                const pct = Math.round((count / (leads?.length || 1)) * 100);
                return (
                  <div key={state}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{state}</span>
                      <span className="text-gray-500">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-gray-400 text-sm">No data yet</p>}
        </div>

        {/* By Buyer Type */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Leads by Buyer Type</h3>
          {topTypes.length > 0 ? (
            <div className="space-y-3">
              {topTypes.map(([type, count]) => {
                const pct = Math.round((count / (leads?.length || 1)) * 100);
                return (
                  <div key={type}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium capitalize">{type}</span>
                      <span className="text-gray-500">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div className="h-2 bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-gray-400 text-sm">No data yet</p>}
        </div>
      </div>

      {/* Social & Content */}
      <h2 className="text-lg font-semibold mb-4">Social & Content Performance</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Total Reach</p>
          <p className="text-3xl font-bold mt-1">{totalReach.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Total Likes</p>
          <p className="text-3xl font-bold mt-1">{totalLikes.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Comments</p>
          <p className="text-3xl font-bold mt-1">{totalComments.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Approval Rate</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{approvalRate}%</p>
          <p className="text-xs text-gray-400 mt-1">{approved} approved · {rejected} rejected</p>
        </div>
      </div>

      {/* Recent FB Posts Performance */}
      {fbPosts && fbPosts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Facebook Post Performance (Recent)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  <th className="text-left py-2 pr-4 text-gray-400 font-medium">Date</th>
                  <th className="text-right py-2 pr-4 text-gray-400 font-medium">Reach</th>
                  <th className="text-right py-2 pr-4 text-gray-400 font-medium">Likes</th>
                  <th className="text-right py-2 pr-4 text-gray-400 font-medium">Comments</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Shares</th>
                </tr>
              </thead>
              <tbody>
                {fbPosts.map((p: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-500">{p.posted_at ? new Date(p.posted_at).toLocaleDateString("en-AU") : "—"}</td>
                    <td className="py-2 pr-4 text-right">{(p.reach || 0).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right">{p.likes ?? 0}</td>
                    <td className="py-2 pr-4 text-right">{p.comments ?? 0}</td>
                    <td className="py-2 text-right">{p.shares ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
