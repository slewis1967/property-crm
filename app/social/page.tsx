import { nexusApi } from "@/utils/nexus-api";

export const dynamic = "force-dynamic";

type Kpis = {
  fb_posted?: number;
  fb_pending_approval?: number;
  last_posted_at?: string | null;
};
type FbListing = { posted_at: string; listing_id: string; post_id: string };
type ScheduledPost = { scheduled_for: string; platform: string; preview: string; posted: boolean };
type Approval = { actioned_at: string; action: string; content_type: string; preview: string };
type SocialPost = {
  posted_at: string;
  content_type: string;
  fb_success: boolean | null;
  ig_success: boolean | null;
  fb_post_id: string | null;
  ig_post_id: string | null;
  error_msg: string | null;
};
type FbPerf = {
  posted_at: string;
  post_id: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
};

type Dashboard = {
  kpis: Kpis;
  fb_listings: FbListing[];
  scheduled: ScheduledPost[];
  approvals: Approval[];
  social_posts: SocialPost[];
  fb_perf: FbPerf[];
};

const EMPTY: Dashboard = {
  kpis: {},
  fb_listings: [],
  scheduled: [],
  approvals: [],
  social_posts: [],
  fb_perf: [],
};

async function getDashboard(): Promise<{ data: Dashboard; error: string | null }> {
  try {
    const res = await nexusApi("/social/dashboard");
    if (!res.ok) {
      return { data: EMPTY, error: `NEXUS responded with HTTP ${res.status}` };
    }
    const data = (await res.json()) as Partial<Dashboard>;
    return { data: { ...EMPTY, ...data }, error: null };
  } catch (e) {
    return { data: EMPTY, error: e instanceof Error ? e.message : "NEXUS API offline" };
  }
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.valueOf())) return s;
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function statusForFbPostId(post_id: string): { label: string; cls: string } {
  if (post_id.startsWith("pending:")) return { label: "Pending approval", cls: "bg-amber-100 text-amber-800" };
  if (post_id.startsWith("expired:")) return { label: "Expired", cls: "bg-gray-100 text-gray-500" };
  return { label: "Posted", cls: "bg-green-100 text-green-700" };
}

function actionPill(action: string): string {
  if (action === "approved") return "bg-green-100 text-green-700";
  if (action === "rejected") return "bg-red-100 text-red-700";
  if (action === "failed") return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-600";
}

export default async function SocialPage() {
  const { data, error } = await getDashboard();
  const { kpis, fb_listings, scheduled, approvals, social_posts, fb_perf } = data;

  const totalReach = fb_perf.reduce((s, p) => s + (p.reach || 0), 0);
  const totalLikes = fb_perf.reduce((s, p) => s + (p.likes || 0), 0);
  const totalComments = fb_perf.reduce((s, p) => s + (p.comments || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Social History</h1>
          <p className="text-gray-500 text-sm mt-1">Elvis AI posts — Facebook, Instagram, scheduled content (sourced from NEXUS)</p>
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-800">
          <strong>NEXUS API unreachable:</strong> {error}. Start it with <code className="text-xs bg-amber-100 px-1.5 py-0.5 rounded">bash /mnt/c/NEXUS-Memory/start-nexus.sh</code>.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Kpi label="FB Posts" value={kpis.fb_posted ?? 0} sub="published" />
        <Kpi
          label="Pending Approval"
          value={kpis.fb_pending_approval ?? 0}
          sub="awaiting Telegram tap"
          valueClass={(kpis.fb_pending_approval ?? 0) > 0 ? "text-amber-600" : ""}
        />
        <Kpi label="Last Post" value={kpis.last_posted_at ? fmtDateTime(kpis.last_posted_at) : "Never"} small />
        <Kpi label="Scheduled" value={scheduled.length} sub="content_schedule queue" />
      </div>

      {/* FB Performance KPIs */}
      {fb_perf.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <Kpi label="Total Reach (last 15)" value={totalReach.toLocaleString()} />
          <Kpi label="Likes" value={totalLikes.toLocaleString()} />
          <Kpi label="Comments" value={totalComments.toLocaleString()} />
        </div>
      )}

      {/* Recent FB listings */}
      <Section title="Recent Facebook listings" subtitle="From fb_posted_listings — drafts the FB scheduler queued, then posted via your Telegram approval">
        {fb_listings.length === 0 ? (
          <Empty>No Facebook listings yet.</Empty>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">When</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Listing</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Post ID / Status</th>
                </tr>
              </thead>
              <tbody>
                {fb_listings.map((p) => {
                  const s = statusForFbPostId(p.post_id);
                  return (
                    <tr key={`${p.posted_at}-${p.listing_id}`} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-4 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(p.posted_at)}</td>
                      <td className="py-2 px-4 font-mono text-xs">{p.listing_id}</td>
                      <td className="py-2 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
                        <span className="ml-2 text-xs text-gray-400 font-mono">{p.post_id.replace(/^(pending|expired):/, "")}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Scheduled queue */}
      <Section title="Upcoming scheduled" subtitle="Pending content_schedule items not yet posted">
        {scheduled.length === 0 ? (
          <Empty>No posts scheduled.</Empty>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Scheduled for</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Platform</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Preview</th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map((s, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(s.scheduled_for)}</td>
                    <td className="py-2 px-4 capitalize">{s.platform || "—"}</td>
                    <td className="py-2 px-4 text-gray-700 truncate max-w-md">{s.preview || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Recent approvals */}
      <Section title="Approval activity" subtitle="content_approvals — your Telegram taps">
        {approvals.length === 0 ? (
          <Empty>No approval activity yet.</Empty>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">When</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Action</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Type</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((a, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(a.actioned_at)}</td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${actionPill(a.action)}`}>
                        {a.action}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-xs text-gray-600">{a.content_type || "—"}</td>
                    <td className="py-2 px-4 text-xs text-gray-700 font-mono truncate max-w-md">{a.preview || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* social_posts (combined platform log) */}
      {social_posts.length > 0 && (
        <Section title="Combined platform log" subtitle="social_posts — FB + IG outcomes">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">When</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Type</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">FB</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">IG</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {social_posts.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(p.posted_at)}</td>
                    <td className="py-2 px-4 capitalize">{p.content_type || "—"}</td>
                    <td className="py-2 px-4 text-xs">{p.fb_success ? "✅" : p.fb_post_id ? "❌" : "—"}</td>
                    <td className="py-2 px-4 text-xs">{p.ig_success ? "✅" : p.ig_post_id ? "❌" : "—"}</td>
                    <td className="py-2 px-4 text-xs text-gray-500 truncate max-w-xs">{p.error_msg || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

function Kpi({
  label, value, sub, valueClass = "", small = false,
}: {
  label: string; value: string | number; sub?: string; valueClass?: string; small?: boolean;
}) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
      <p className="text-xs text-gray-500 uppercase font-semibold">{label}</p>
      <p className={`${small ? "text-sm" : "text-3xl"} font-bold mt-1 ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 italic px-1">{children}</p>;
}
