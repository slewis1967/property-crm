/** Analytics: read the stock, outreach and advisor figures. Reads only; all figures are seeded demo data. */
export default {
  start: "/analytics",
  steps: [
    {
      say: "This is the Analytics page. Here is how to check stock, outreach and advisor activity.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Scroll to Aggregator Pipeline. These figures cover the last seven days.",
      do: async (h) => h.point('h2:has-text("Aggregator Pipeline")', 1600),
    },
    {
      say: "Check Pending Review. An amber number means properties are waiting for someone to check them.",
      do: async (h) => h.point('p:text-is("Pending Review")', 1800),
    },
    {
      say: "Read the Recent Ingestion Runs table, and look for any run marked failed.",
      do: async (h) => {
        await h.point('h3:has-text("Recent Ingestion Runs")', 900);
        await h.point('span:text-is("failed")', 1500);
      },
    },
    {
      say: "Scroll to Outreach. It shows texts sent, their cost and opt outs, and how many contacts are in a sequence.",
      do: async (h) => {
        await h.point('h2:text-is("Outreach")', 900);
        await h.point('p:text-is("SMS Sent (30d)")', 800);
        await h.point('p:text-is("Active Sequences")', 1000);
      },
    },
    {
      say: "Then scroll to Advisor Activity. Pending is the number of recommendations waiting for you in Advisor.",
      do: async (h) => {
        await h.point('h2:has-text("Advisor Activity")', 900);
        await h.point('p:text-is("Pending")', 1500);
      },
    },
  ],
};
