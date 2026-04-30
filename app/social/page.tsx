import { supabase } from "../../utils/supabase";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  const [
    { data: socialPosts },
    { data: fbPerf },
    { data: igPosts },
    { data: schedule },
  ] = await Promise.all([
    supabase.from("social_posts").select("*").order("posted_at", { ascending: false }).limit(30),
    supabase.from("fb_post_performance").select("*").order("posted_at", { ascending: false }).limit(20),
    supabase.from("instagram_posts").select("*").order("posted_at", { ascending: false }).limit(10),
    supabase.from("content_schedule").select("*").eq("posted", false).order("scheduled_for", { ascending: true }).limit(10),
  ]);

  const fbSuccessCount = socialPosts?.filter((p: any) => p.fb_success).length || 0;
  const igSuccessCount = socialPosts?.filter((p: any) => p.ig_success).length || 0;
  const totalReach = fbPerf?.reduce((s: number, p: any) => s + (p.reach || 0), 0) || 0;
  const totalEngagement = fbPerf?.reduce((s: number, p: any) => s + (p.likes || 0) + (p.comments || 0) + (p.shares || 0), 0) || 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Social History</h1>
          <p className="text-gray-500 text-sm mt-1">Elvis AI posts — Facebook, Instagram, scheduled content</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">FB Posts</p>
          <p className="text-3xl font-bold mt-1">{fbSuccessCount}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">IG Posts</p>
          <p className="text-3xl font-bold mt-1">{igSuccessCount}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Total Reach</p>
          <p className="text-3xl font-bold mt-1">{totalReach.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Engagements</p>
          <p className="text-3xl font-bold mt-1">{totalEngagement.toLocaleString()}</p>
        </div>
      </div>

      {/* Scheduled Upcoming */}
      {schedule && schedule.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Upcoming Scheduled Posts</h2>
          <div className="space-y-3">
            {schedule.map((s: any, i: number) => (
              <div key={i} className="flex justify-between items-center border border-blue-100 bg-blue-50 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium capitalize">{s.platform || "—"}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{s.content_body || "—"}</p>
                </div>
                <span className="text-xs text-blue-600 font-medium whitespace-nowrap ml-4">
                  {s.scheduled_for ? new Date(s.scheduled_for).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Facebook Posts */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Facebook Posts</h2>
          {fbPerf && fbPerf.length > 0 ? (
            <div className="space-y-4">
              {fbPerf.map((p: any, i: number) => (
                <div key={i} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-xs text-gray-400">
                      {p.posted_at ? new Date(p.posted_at).toLocaleDateString("en-AU") : "—"}
                    </p>
                    {p.post_id && (
                      <a href={`https://facebook.com/${p.post_id}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline">View →</a>
                    )}
                  </div>
                  {p.message_preview && (
                    <p className="text-sm text-gray-700 mb-3 line-clamp-2">{p.message_preview}</p>
                  )}
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>👁 {(p.reach || 0).toLocaleString()}</span>
                    <span>❤️ {p.likes || 0}</span>
                    <span>💬 {p.comments || 0}</span>
                    <span>🔁 {p.shares || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No Facebook posts yet.</p>
          )}
        </div>

        {/* All Social Posts Log */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">All Posts Log</h2>
          {socialPosts && socialPosts.length > 0 ? (
            <div className="space-y-3">
              {socialPosts.map((p: any, i: number) => (
                <div key={i} className="flex justify-between items-center border-b border-gray-50 pb-3 last:border-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold capitalize">{p.content_type || "Post"}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${p.fb_success ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>FB</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${p.ig_success ? "bg-pink-100 text-pink-600" : "bg-gray-100 text-gray-400"}`}>IG</span>
                    </div>
                    {p.error_msg && <p className="text-xs text-red-400 mt-0.5">{p.error_msg}</p>}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                    {p.posted_at ? new Date(p.posted_at).toLocaleDateString("en-AU") : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No posts yet. Elvis AI posts content at 9am, 12pm, and 5pm AEST.</p>
          )}
        </div>
      </div>
    </div>
  );
}
