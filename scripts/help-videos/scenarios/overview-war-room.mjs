/**
 * Overview of the War Room. A tour only; nothing is changed.
 * The daily brief at the top of the page is a made-up stand-in; see lib/command-util.mjs.
 */
import { warRoomBrief } from "../lib/command-util.mjs";

export default {
  start: "/",
  steps: [
    {
      say: "This is the War Room, the home page of the CRM. It shows what needs your attention today.",
      do: async (h) => warRoomBrief(h),
    },
    {
      say: "At the top is today's brief from Elvis. It lists the most urgent things to do.",
      do: async (h) => h.point("p.whitespace-pre-wrap", 2500),
    },
    {
      say: "Next are four number cards with live counts of leads, contacts, stock and hot leads. Each one links to the full page.",
      do: async (h) => {
        await h.point('h3:has-text("Total Leads")', 600);
        await h.point('h3:has-text("Contacts (CRM)")', 600);
        await h.point('h3:has-text("Stock Pool")', 600);
        await h.point('h3:has-text("Hot Leads")', 600);
      },
    },
    {
      say: "Open Tasks lists the tasks set on opportunities, soonest due first, with overdue ones in red.",
      do: async (h) => {
        await h.point('h2:has-text("Open Tasks")', 1000);
        await h.point("text=(overdue) >> nth=0", 1200);
      },
    },
    {
      say: "Under that, Recent Leads shows the newest enquiries from Lead Intake, and Hot Contacts shows your hottest people.",
      do: async (h) => {
        await h.point('h2:has-text("Recent Leads")', 1200);
        await h.point('h2:has-text("Hot Contacts")', 1200);
      },
    },
    {
      say: "Recent Contacts is a table of the latest people added, with their type, state, temperature and score.",
      do: async (h) => h.point('h2:has-text("Recent Contacts")', 2000),
    },
    {
      say: "At the bottom are six quick calculators for use during a call, such as stamp duty and borrowing capacity. Nothing in them is saved.",
      do: async (h) => {
        await h.point('h2:has-text("Quick calculators")', 1000);
        await h.point('h3:has-text("Stamp duty by state")', 800);
        await h.point('h3:has-text("Borrowing capacity")', 800);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
