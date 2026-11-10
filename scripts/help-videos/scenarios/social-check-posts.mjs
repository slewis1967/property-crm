/** Social History: check what has been posted. The posts come from the stand-in NEXUS and are invented. */
export default {
  start: "/social",
  steps: [
    {
      say: "This video shows how to check what has been posted on social media. Open Social History, under Elvis in the sidebar.",
      do: async (h) => h.point('nav a[href="/social"]', 1200),
    },
    {
      say: "The tiles at the top show how many posts have been published, and when the last one went out.",
      do: async (h) => {
        await h.point('p:text-is("FB Posts")', 1000);
        await h.point('p:text-is("Last Post")', 1000);
      },
    },
    {
      say: "Scroll down to Recent Facebook listings.",
      do: async (h) => h.point('h2:has-text("Recent Facebook listings")', 1200),
    },
    {
      say: "Check the label in the status column. Posted means it is live.",
      do: async (h) => h.point('span:text-is("Posted") >> nth=0', 1400),
    },
    {
      say: "Pending approval means it is still waiting in Telegram. Expired means it was never approved.",
      do: async (h) => {
        await h.point('span:text-is("Pending approval")', 1100);
        await h.point('span:text-is("Expired")', 1100);
      },
    },
    {
      say: "Further down, the Combined platform log shows Facebook and Instagram together.",
      do: async (h) => h.point('h2:has-text("Combined platform log")', 1300),
    },
    {
      say: "A tick means the post worked. A cross means it failed, and the reason is in the Notes column.",
      do: async (h) => h.point("text=Instagram needs a square image", 1600),
    },
  ],
};
