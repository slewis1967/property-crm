/** Approval Queue: see what is waiting. The posts come from the stand-in NEXUS and are invented. */
export default {
  start: "/approvals",
  steps: [
    {
      say: "This video shows how to see what is waiting for approval. Open Approval Queue, under Elvis in the sidebar.",
      do: async (h) => h.point('nav a[href="/approvals"]', 1200),
    },
    {
      say: "The Pending Approval box lists each item that is waiting. The number waiting is also shown at the top right.",
      do: async (h) => {
        await h.point('h2:has-text("Pending Approval")', 900);
        await h.point("text=2 Pending", 1200);
      },
    },
    {
      say: "Read the card. It shows the type of content and the start of the wording.",
      do: async (h) => h.point("text=Just released", 1800),
    },
    {
      say: "There are no approve buttons on this page. Open Telegram and tap the tick, the cross or the pencil on the matching message.",
      do: async (h) => h.point("text=Content pending review via Telegram", 2200),
    },
    {
      say: "Approving in Telegram can publish the content, so read it here first.",
      do: async (h) => h.point("text=Three things first home buyers", 1500),
    },
    {
      say: "After you have answered in Telegram, refresh this page to see what is left. When nothing is waiting, the box says Queue is clear.",
      do: async (h) => {
        await h.page.reload({ waitUntil: "networkidle" });
        await h.point('h2:has-text("Pending Approval")', 1200);
      },
    },
  ],
};
