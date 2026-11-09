/** Overview of Approval Queue. A tour only. Pending items come from the stand-in NEXUS; all rows are invented. */
export default {
  start: "/approvals",
  steps: [
    {
      say: "Approval Queue shows the content Elvis has prepared that is waiting for a yes or no, and what was decided before.",
      do: async (h) => h.point('h1:text-is("Approval Queue")', 1500),
    },
    {
      say: "The line under the heading is a reminder that decisions are made in Telegram, not on this page.",
      do: async (h) => h.point("text=Content pending review via Telegram", 1800),
    },
    {
      say: "The count at the top right shows how many items are waiting.",
      do: async (h) => h.point("text=2 Pending", 1400),
    },
    {
      say: "Pending Approval has one card for each item, with the type of content and the start of its wording.",
      do: async (h) => {
        await h.point('h2:has-text("Pending Approval")', 900);
        await h.point("text=Just released", 1500);
      },
    },
    {
      say: "Approval History lists the last fifty decisions, newest first.",
      do: async (h) => h.point('h2:text-is("Approval History")', 1500),
    },
    {
      say: "Green is approved, red is rejected, and yellow means changes were asked for. The date is on the right of each row.",
      do: async (h) => {
        await h.point('p:text-is("rejected")', 1000);
        await h.point('p:text-is("revision requested")', 1000);
        await h.point('div.justify-between:has(p:text-is("revision requested")) > div.text-right', 1000);
      },
    },
    {
      say: "Posts that were approved then show on the Social History page.",
      do: async (h) => h.point('nav a[href="/social"]', 1400),
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
