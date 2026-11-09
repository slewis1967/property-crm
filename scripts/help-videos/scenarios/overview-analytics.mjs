/** Overview of Analytics. A tour only; the page is read-only. All figures are seeded demo data. */
export default {
  start: "/analytics",
  steps: [
    {
      say: "This is the Analytics page. It is a read only summary of leads, new stock, messaging and advisor activity.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Lead Intelligence comes first. It shows total leads, the share matched to a property, the average score, and the number of hot leads.",
      do: async (h) => {
        await h.point('h2:has-text("Lead Intelligence")', 900);
        await h.point('p:text-is("Match Rate")', 900);
        await h.point('p:text-is("Hot Leads")', 900);
      },
    },
    {
      say: "Under that, two charts show the top five states and buyer types, with their share of all leads.",
      do: async (h) => {
        await h.point('h3:has-text("Leads by State")', 1300);
        await h.point('h3:has-text("Leads by Buyer Type")', 1300);
      },
    },
    {
      say: "Aggregator Pipeline covers the last seven days of stock coming in, including how many properties are waiting for review.",
      do: async (h) => {
        await h.point('h2:has-text("Aggregator Pipeline")', 1200);
        await h.point('p:text-is("Pending Review")', 1300);
      },
    },
    {
      say: "Recent Ingestion Runs is a table of the latest stock lists processed, by builder, with a status for each.",
      do: async (h) => h.point('h3:has-text("Recent Ingestion Runs")', 1800),
    },
    {
      say: "Outreach shows texts sent in the last thirty days, their cost, opt outs, and how many contacts are in a sequence.",
      do: async (h) => {
        await h.point('h2:text-is("Outreach")', 1000);
        await h.point('p:text-is("Active Sequences")', 1300);
      },
    },
    {
      say: "Last is Advisor Activity. It counts the recommendations that are pending, applied or dismissed on the Advisor page.",
      do: async (h) => h.point('h2:has-text("Advisor Activity")', 2500),
    },
    {
      say: "For help reading these figures, pick a guide from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
