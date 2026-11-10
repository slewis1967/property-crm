/** Social History: see what is scheduled. The posts come from the stand-in NEXUS and are invented. */
export default {
  start: "/social",
  steps: [
    {
      say: "This video shows how to see which social media posts are scheduled to go out next. On Social History, check the Scheduled tile at the top.",
      do: async (h) => h.point('p:text-is("Scheduled")', 1500),
    },
    {
      say: "It shows how many posts are waiting to go out.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Scroll down to Upcoming scheduled.",
      do: async (h) => h.point('h2:text-is("Upcoming scheduled")', 1300),
    },
    {
      say: "Each row shows when the post goes out, where it goes, and the start of its wording.",
      do: async (h) => {
        await h.point('th:text-is("Scheduled for")', 800);
        await h.point('th:text-is("Platform")', 800);
        await h.point('th:text-is("Preview")', 800);
      },
    },
    {
      say: "Below that, Approval activity lists the most recent decisions.",
      do: async (h) => h.point('h2:text-is("Approval activity")', 1400),
    },
    {
      say: "This page is for viewing only. Posts cannot be edited or cancelled from here.",
      do: async (h) => h.pause(700),
    },
  ],
};
