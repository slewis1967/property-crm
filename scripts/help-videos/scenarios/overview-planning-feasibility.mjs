/**
 * Overview of Planning Feasibility. A tour only; nothing is changed.
 * Opens one seeded demo report (an invented address) to show what a report looks like.
 */
const SAVED = 'div.flex.items-center.gap-3:has(p:has-text("27 Placeholder Parade"))';

export default {
  start: "/feasibility",
  steps: [
    {
      say: "This is Planning Feasibility. It gives a first look at what could be built or subdivided on any Australian block, written up as a report.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Property address is the block you want assessed.",
      do: async (h) => h.point('input[placeholder^="e.g. 1491"]', 1500),
    },
    {
      say: "Under it you type what you want to know, in your own words, with anything you already know about the block.",
      do: async (h) => h.point("textarea", 2000),
    },
    {
      say: "Start assessment begins the work. A few questions follow, and then the report is written.",
      do: async (h) => h.point('button:has-text("Start assessment")', 1800),
    },
    {
      say: "Saved reports, under the form, lists every report saved to the CRM, with Open and Delete beside each.",
      do: async (h) => {
        await h.point('h2:has-text("Saved reports")', 1000);
        await h.point(`${SAVED} button:text-is("Open")`, 1200);
      },
    },
    {
      say: "An open report is set out on the NextKey letterhead, with key figures at the top, then a summary, the planning controls and next steps.",
      do: async (h) => {
        await h.click(`${SAVED} button:text-is("Open")`);
        await h.page.waitForSelector("#feasibility-report");
        await h.point("#feasibility-report h1", 1000);
        await h.scroll(380);
        await h.pause(900);
      },
    },
    {
      say: "The bar above a report has Export PDF, Save to CRM, and New assessment.",
      do: async (h) => {
        await h.scroll(-380);
        await h.point('button:has-text("Export PDF")', 800);
        await h.point('button:has-text("New assessment")', 800);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
