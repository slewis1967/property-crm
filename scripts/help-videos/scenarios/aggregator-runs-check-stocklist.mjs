/** Ingestion Runs: confirm a builder's stocklist was processed. Read only; demo data. */
const runs = "main table >> nth=1";

export default {
  start: "/aggregator/runs",
  steps: [
    {
      say: "This video shows how to check that a builder's stocklist was processed.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Scroll to the bottom table and find the builder. The newest runs are at the top.",
      do: async (h) => h.point(`${runs} >> tbody tr:has-text("Bluegum Homes") >> nth=0 >> td >> nth=1`, 1500),
    },
    {
      say: "Check the Status column to see whether the run completed.",
      do: async (h) => h.point(`${runs} >> th:has-text("Status")`, 1200),
    },
    {
      say: "A failed run shows the reason in red under the email subject.",
      do: async (h) => h.point("text=The attachment could not be opened >> nth=0", 1600),
    },
    {
      say: "These columns show the properties added, updated, withdrawn, and sent for review.",
      do: async (h) => {
        await h.point(`${runs} >> th:has-text("+New")`, 600);
        await h.point(`${runs} >> th:has-text("~Upd")`, 600);
        await h.point(`${runs} >> th:has-text("-Wdrn")`, 600);
        await h.point(`${runs} >> th:has-text("?Rev")`, 800);
      },
    },
    {
      say: "If the review number is above zero, open Review Queue in the sidebar. Those properties wait there for approval.",
      do: async (h) => h.point('aside a[href="/aggregator/review"]', 1800),
    },
  ],
};
