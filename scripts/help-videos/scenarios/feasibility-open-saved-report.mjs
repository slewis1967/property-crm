/**
 * Planning Feasibility: open a saved report, then delete one.
 * Uses seeded demo reports for invented addresses (the seed file puts them back).
 * The recorder has no printer, so Export PDF is only pointed at.
 */
const row = (address) => `div.flex.items-center.gap-3:has(p:has-text("${address}"))`;
const OPEN = row("27 Placeholder Parade");
const REMOVE = row("55 Placeholder Parade");

export default {
  start: "/feasibility",
  steps: [
    {
      say: "This is Planning Feasibility. Here is how to open a report you saved earlier, or delete one.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Scroll to Saved reports, under the form. Each one shows the address and when it was saved.",
      do: async (h) => h.point('h2:has-text("Saved reports")', 1500),
    },
    {
      say: "Click Open beside the report you want.",
      do: async (h) => {
        await h.click(`${OPEN} button:text-is("Open")`);
        await h.page.waitForSelector("#feasibility-report");
        await h.pause(700);
      },
    },
    {
      say: "The report opens. Click Export PDF if you need a copy.",
      do: async (h) => {
        await h.point('button:has-text("Export PDF")', 1200);
        await h.scroll(380);
        await h.pause(700);
      },
    },
    {
      say: "Click New assessment to go back to the first screen.",
      do: async (h) => {
        await h.scroll(-380);
        await h.click('button:has-text("New assessment")');
        await h.page.waitForSelector('h2:has-text("Saved reports")');
      },
    },
    {
      say: "To remove a report you no longer need, click Delete beside it.",
      do: async (h) => h.point(`${REMOVE} button:text-is("Delete")`, 1200),
    },
    {
      say: "You are asked to confirm. Click OK and the report is removed. Deleting cannot be undone.",
      do: async (h) => {
        await h.click(`${REMOVE} button:text-is("Delete")`);
        await h.page.waitForSelector(REMOVE, { state: "detached" });
        await h.pause(700);
      },
    },
  ],
};
