/** Overview of Social History. A tour only. Everything shown comes from the stand-in NEXUS and is invented. */
export default {
  start: "/social",
  steps: [
    {
      say: "Social History is a record of the Facebook and Instagram posts Elvis has published, what is lined up next, and how they performed.",
      do: async (h) => h.point('h1:text-is("Social History")', 1500),
    },
    {
      say: "The top row of tiles shows posts published, posts waiting for approval, when the last post went out, and how many are scheduled.",
      do: async (h) => {
        await h.point('p:text-is("FB Posts")', 900);
        await h.point('p:text-is("Pending Approval")', 900);
        await h.point('p:text-is("Scheduled")', 900);
      },
    },
    {
      say: "The second row shows reach, likes and comments for the most recent posts.",
      do: async (h) => h.point('p:has-text("Total Reach")', 1500),
    },
    {
      say: "Recent Facebook listings shows each listing put forward for Facebook, marked Posted, Pending approval or Expired.",
      do: async (h) => {
        await h.point('h2:has-text("Recent Facebook listings")', 900);
        await h.point('span:text-is("Posted") >> nth=0', 1300);
      },
    },
    {
      say: "Upcoming scheduled lists the posts waiting to go out, with the date and where they will be posted.",
      do: async (h) => h.point('h2:text-is("Upcoming scheduled")', 1600),
    },
    {
      say: "Approval activity shows the most recent decisions made in Telegram.",
      do: async (h) => h.point('h2:text-is("Approval activity")', 1500),
    },
    {
      say: "The Combined platform log shows Facebook and Instagram side by side, with a tick or a cross for each post.",
      do: async (h) => {
        await h.point('h2:has-text("Combined platform log")', 900);
        await h.point("text=Instagram needs a square image", 1300);
      },
    },
    {
      say: "This page is for viewing only. For step by step help, pick a task from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
