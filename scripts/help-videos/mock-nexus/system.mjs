/**
 * Made-up NEXUS answers for the "system" help videos: the Approval Queue and
 * Social History pages. Nothing here is a real post, listing or approval.
 */
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const hoursAhead = (h) => new Date(Date.now() + h * 3600_000).toISOString();

const routes = {
  // app/approvals/page.tsx
  "GET /api/approvals/pending": () => ({
    pending: [
      {
        content_type: "facebook post",
        id: "demo-post-120",
        content:
          "Just released: a four bedroom house and land package 35 minutes north of Brisbane. Walk to the school and the shops. Message us for the floor plan.",
      },
      {
        content_type: "instagram post",
        id: "demo-post-119",
        content:
          "Three things first home buyers ask us most, and the plain answers. Swipe through, then send us your own question.",
      },
    ],
  }),

  // app/social/page.tsx
  "GET /social/dashboard": () => ({
    kpis: { fb_posted: 14, fb_pending_approval: 2, last_posted_at: hoursAgo(20) },
    fb_listings: [
      { posted_at: hoursAgo(2), listing_id: "DEMO-LOT-120", post_id: "pending:demo-120" },
      { posted_at: hoursAgo(20), listing_id: "DEMO-LOT-118", post_id: "demo-900118" },
      { posted_at: hoursAgo(44), listing_id: "DEMO-LOT-116", post_id: "demo-900116" },
      { posted_at: hoursAgo(70), listing_id: "DEMO-LOT-115", post_id: "expired:demo-115" },
      { posted_at: hoursAgo(92), listing_id: "DEMO-LOT-114", post_id: "demo-900114" },
      { posted_at: hoursAgo(140), listing_id: "DEMO-LOT-113", post_id: "demo-900113" },
    ],
    scheduled: [
      { scheduled_for: hoursAhead(18), platform: "facebook", preview: "Open home this Saturday at 10am. Four bedrooms, two bathrooms, double garage.", posted: false },
      { scheduled_for: hoursAhead(42), platform: "instagram", preview: "What does pre-approval really mean? A quick explainer for first home buyers.", posted: false },
      { scheduled_for: hoursAhead(90), platform: "facebook", preview: "New land release: twelve blocks from 400 square metres.", posted: false },
    ],
    approvals: [
      { actioned_at: hoursAgo(21), action: "approved", content_type: "facebook post", preview: "demo-post-118" },
      { actioned_at: hoursAgo(30), action: "rejected", content_type: "facebook post", preview: "demo-post-117" },
      { actioned_at: hoursAgo(45), action: "approved", content_type: "instagram post", preview: "demo-post-116" },
    ],
    social_posts: [
      { posted_at: hoursAgo(20), content_type: "listing", fb_success: true, ig_success: true, fb_post_id: "demo-900118", ig_post_id: "demo-ig-118", error_msg: null },
      { posted_at: hoursAgo(44), content_type: "listing", fb_success: true, ig_success: false, fb_post_id: "demo-900116", ig_post_id: "demo-ig-116", error_msg: "Instagram needs a square image" },
      { posted_at: hoursAgo(92), content_type: "tip", fb_success: true, ig_success: true, fb_post_id: "demo-900114", ig_post_id: "demo-ig-114", error_msg: null },
    ],
    fb_perf: [
      { posted_at: hoursAgo(20), post_id: "demo-900118", reach: 1240, likes: 38, comments: 6, shares: 3 },
      { posted_at: hoursAgo(44), post_id: "demo-900116", reach: 860, likes: 21, comments: 2, shares: 1 },
      { posted_at: hoursAgo(92), post_id: "demo-900114", reach: 1530, likes: 47, comments: 9, shares: 5 },
    ],
  }),
};
export default routes;
