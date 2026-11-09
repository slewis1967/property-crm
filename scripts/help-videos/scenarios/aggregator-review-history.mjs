/** Review Queue: look back at what was approved or rejected. Read only; demo data. */
import { centre } from "./lib/compliance-stock.mjs";

export default {
  start: "/aggregator/review",
  steps: [
    {
      say: "This video shows how to see what has already been approved or rejected in the Review Queue.",
      do: async (h) => {
        await h.page.waitForSelector("text=confidence");
        await h.pause(400);
      },
    },
    {
      say: "Click the Approved tab above the list.",
      do: async (h) => {
        await h.click('button:text-is("approved")');
        await h.page.waitForSelector("text=Lot 164");
      },
    },
    {
      say: "Use the Sort dropdown to order the list by confidence or by date.",
      do: async (h) => h.select("main select", "newest"),
    },
    {
      say: "Click an item to see its details. Approved and rejected items cannot be edited.",
      do: async (h) => {
        await h.click('button:has-text("Lot 164")');
        await centre(h, "text=Published to the Aggregator Feed");
        await h.point("text=Published to the Aggregator Feed", 1500);
      },
    },
    {
      say: "The Rejected tab shows the items that were not published.",
      do: async (h) => {
        await h.click('button:text-is("rejected")');
        await h.page.waitForSelector("text=Lorikeet Park");
        await h.pause(900);
      },
    },
    {
      say: "Click the Pending tab to go back to the items waiting for review. The number in the sidebar shows how many there are.",
      do: async (h) => {
        await h.click('button:text-is("pending")');
        await h.pause(2200);
      },
    },
  ],
};
