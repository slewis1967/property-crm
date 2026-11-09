/** Overview of the Activity Feed. A tour only; the page is read-only. Entries come from the stand-in NEXUS service. */
export default {
  start: "/activity",
  steps: [
    {
      say: "This is the Activity Feed. It is a record of what Elvis has done with content and its automated runs, and nothing on it can be changed.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Content Approvals is the main list on the left. Each entry is a piece of content and the decision made on it.",
      do: async (h) => h.point('h2:has-text("Content Approvals")', 2200),
    },
    {
      say: "An entry shows the decision, the type of content, a short preview, the date, and a reference number.",
      do: async (h) => h.point("div.border.rounded-lg.p-4 >> nth=0", 2800),
    },
    {
      say: "The colours tell you the decision at a glance. Green is approved, yellow is a revision request, red is rejected, and orange is a failure.",
      do: async (h) => {
        await h.point("div.bg-green-50 >> nth=0", 700);
        await h.point("div.bg-yellow-50 >> nth=0", 700);
        await h.point("div.bg-red-50 >> nth=0", 700);
        await h.point("div.bg-orange-50 >> nth=0", 700);
      },
    },
    {
      say: "Pipeline Runs is the panel on the right. It has one card for each automated run, marked ok or errors.",
      do: async (h) => {
        await h.page.mouse.wheel(0, -3000);
        await h.pause(400);
        await h.point('h2:has-text("Pipeline Runs")', 1000);
        await h.point('span:text-is("errors")', 1300);
      },
    },
    {
      say: "Each run shows four counts. They are listings scraped, content written, research done, and items posted.",
      do: async (h) => h.point("div.grid.grid-cols-2.gap-1 >> nth=0", 2500),
    },
    {
      say: "For help reading this page, pick the guide from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
