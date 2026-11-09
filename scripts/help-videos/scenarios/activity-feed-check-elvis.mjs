/** Activity Feed: see what Elvis has been doing. Reads only; the entries come from the stand-in NEXUS service. */
export default {
  start: "/activity",
  steps: [
    {
      say: "This is the Activity Feed. Here is how to see what Elvis has been doing.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Read the Content Approvals list. Each entry shows the decision, the type of content, a short preview and the date.",
      do: async (h) => {
        await h.point('h2:has-text("Content Approvals")', 1000);
        await h.point("div.border.rounded-lg.p-4 >> nth=0", 1800);
      },
    },
    {
      say: "Use the colours to scan the list. Green is approved, red is rejected, yellow is a revision request and orange is a failure.",
      do: async (h) => {
        await h.point("div.bg-green-50 >> nth=0", 700);
        await h.point("div.bg-yellow-50 >> nth=0", 700);
        await h.point("div.bg-red-50 >> nth=0", 700);
        await h.point("div.bg-orange-50 >> nth=0", 700);
      },
    },
    {
      say: "Then read Pipeline Runs on the right. Each run is marked ok or errors.",
      do: async (h) => {
        await h.point('h2:has-text("Pipeline Runs")', 1000);
        await h.point('span:text-is("errors")', 1300);
      },
    },
    {
      say: "Each run also shows four counts. They are scraped, content, research and posted.",
      do: async (h) => h.point("div.grid.grid-cols-2.gap-1 >> nth=0", 2200),
    },
    {
      say: "If you ever see a yellow bar saying the service is offline, tell your administrator. The page cannot show activity until it is running again.",
      do: async (h) => h.pause(500),
    },
  ],
};
