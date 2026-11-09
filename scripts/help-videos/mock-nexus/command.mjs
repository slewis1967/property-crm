/**
 * Made-up NEXUS answers for the Command group help videos.
 * Activity Feed reads /api/activity and /api/pipeline. Every item is invented.
 */
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

const routes = {
  "GET /api/activity": () => ({
    events: [
      { id: "C-1042", action: "approved", content_type: "Facebook post", content_preview: "Thinking about your first home? Here are three things to check before you sign a building contract.", actioned_at: daysAgo(0) },
      { id: "C-1041", action: "approved", content_type: "Blog article", content_preview: "Suburb snapshot: what first home buyers are paying north of Brisbane this spring.", actioned_at: daysAgo(1) },
      { id: "C-1040", action: "revision_requested", content_type: "Instagram post", content_preview: "House and land packages explained in plain English. Draft sent back for a shorter caption.", actioned_at: daysAgo(1) },
      { id: "C-1039", action: "rejected", content_type: "Facebook post", content_preview: "Draft about interest rates. Rejected because the figures were out of date.", actioned_at: daysAgo(2) },
      { id: "C-1038", action: "approved", content_type: "Email newsletter", content_preview: "October update: new stock at Demo Meadows and a guide to dual occupancy homes.", actioned_at: daysAgo(3) },
      { id: "C-1037", action: "failed", content_type: "Instagram post", content_preview: "Scheduled post could not be published. It will be tried again.", actioned_at: daysAgo(4) },
    ],
  }),
  "GET /api/pipeline": () => ({
    runs: [
      { started_at: daysAgo(0), errors: 0, listings_processed: 42, content_generated: 3, research_completed: 5, posted: 2 },
      { started_at: daysAgo(1), errors: 0, listings_processed: 38, content_generated: 2, research_completed: 4, posted: 2 },
      { started_at: daysAgo(2), errors: 1, listings_processed: 17, content_generated: 1, research_completed: 2, posted: 0 },
      { started_at: daysAgo(3), errors: 0, listings_processed: 40, content_generated: 3, research_completed: 5, posted: 3 },
    ],
  }),
};
export default routes;
