/** Overview of Settings. A tour only: nothing is changed. The staff and brokers shown are invented. */
export default {
  start: "/settings",
  steps: [
    {
      say: "Settings holds the choices that apply across the whole CRM.",
      do: async (h) => h.point('h1:text-is("Settings")', 1400),
    },
    {
      say: "AI instructions is a text box for extra instructions to the voice assistant, such as its tone.",
      do: async (h) => {
        await h.point('h2:text-is("AI instructions")', 900);
        await h.point('textarea[placeholder^="e.g."]', 1300);
      },
    },
    {
      say: "Email signature holds one signature for each person. Pick a name to see theirs.",
      do: async (h) => {
        await h.point('h2:text-is("Email signature")', 900);
        await h.point("text=Editing signature for", 1200);
      },
    },
    {
      say: "The details are on the left, and the preview on the right shows what people will receive.",
      do: async (h) => h.point('p:text-is("Preview") + div', 1800),
    },
    {
      say: "Calendar and meetings is a short note on how meetings are booked. There is nothing to set here.",
      do: async (h) => h.point('h2:has-text("Calendar")', 1500),
    },
    {
      say: "Brokers lists who a completed Fact Find can be sent to. Brokers added here appear in the list on the Fact Find page.",
      do: async (h) => {
        await h.point('h2:text-is("Brokers")', 900);
        await h.point('div.space-y-2 > div:has(button:text-is("Remove")) >> nth=0', 1500);
      },
    },
    {
      say: "Property types are the categories used to sort stock. Types added here appear in the filter on the Aggregator Feed.",
      do: async (h) => {
        await h.point('h2:text-is("Property types")', 900);
        await h.point('input[placeholder^="New type name"]', 1300);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
