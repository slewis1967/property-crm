/** Analytics: read the lead numbers. Reads only; all figures come from seeded demo data. */
export default {
  start: "/analytics",
  steps: [
    {
      say: "This is the Analytics page. Here is how to see how your leads are tracking.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Look at the Lead Intelligence cards at the top.",
      do: async (h) => h.point('h2:has-text("Lead Intelligence")', 1200),
    },
    {
      say: "Total Leads is every lead on file. Match Rate is the share that have been matched to a property.",
      do: async (h) => {
        await h.point('p:text-is("Total Leads")', 1100);
        await h.point('p:text-is("Match Rate")', 1300);
      },
    },
    {
      say: "Average Score shows lead quality out of one hundred. Hot Leads has the warm and cold counts in small print underneath.",
      do: async (h) => {
        await h.point('p:text-is("Avg Score")', 1200);
        await h.point('p:text-is("Hot Leads")', 1500);
      },
    },
    {
      say: "Leads by State and Leads by Buyer Type show the top five of each, with their share of all leads.",
      do: async (h) => {
        await h.point('h3:has-text("Leads by State")', 1400);
        await h.point('h3:has-text("Leads by Buyer Type")', 1400);
      },
    },
    {
      say: "This page has no filters or export. Reload the page whenever you want the latest figures.",
      do: async (h) => {
        await h.page.reload({ waitUntil: "networkidle" });
        await h.pause(800);
      },
    },
  ],
};
