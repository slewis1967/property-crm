/**
 * War Room: check what needs attention today.
 *
 * The daily brief is written by an AI service the demo has no key for, so the
 * browser's call to /api/ai/dashboard-brief is answered here with a made-up
 * brief about the demo cast. Everything else on the page is real demo data.
 */
import { warRoomBrief } from "../lib/command-util.mjs";

export default {
  start: "/",
  steps: [
    {
      say: "This is the War Room, the home page of the CRM. Here is how to check what needs attention today.",
      do: async (h) => warRoomBrief(h),
    },
    {
      say: "Start with today's brief from Elvis at the top of the page. It lists the most urgent things first.",
      do: async (h) => h.point("p.whitespace-pre-wrap", 2200),
    },
    {
      say: "Next, check the four cards. They show live counts of your leads, contacts, stock and hot leads.",
      do: async (h) => {
        await h.point('h3:has-text("Total Leads")', 500);
        await h.point('h3:has-text("Contacts (CRM)")', 500);
        await h.point('h3:has-text("Stock Pool")', 500);
        await h.point('h3:has-text("Hot Leads")', 500);
      },
    },
    {
      say: "Click View hot leads on the Hot Leads card. It opens Lead Intake.",
      do: async (h) => {
        await h.click('a[href="/leads?filter=hot"]');
        await h.page.waitForURL(/\/leads/);
        await h.page.waitForLoadState("networkidle");
        await h.pause(1200);
      },
    },
    {
      say: "Come back to the War Room and read Open Tasks. They are listed soonest due first, and overdue ones are shown in red.",
      do: async (h) => {
        await h.goto("/");
        await h.point('h2:has-text("Open Tasks")', 900);
        await h.point("text=(overdue)", 1200);
      },
    },
    {
      say: "Then scan Recent Leads and Hot Contacts. Click View all on either panel to open the full list.",
      do: async (h) => {
        await h.point('h2:has-text("Recent Leads")', 900);
        await h.point('h2:has-text("Hot Contacts")', 900);
        await h.point('a:has-text("View all") >> nth=0', 900);
      },
    },
  ],
};
