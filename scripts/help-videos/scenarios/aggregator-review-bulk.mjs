/** Review Queue: approve several items in one go. Demo data only. */
import { waitForApi } from "./lib/compliance-stock.mjs";

const box = (lot) => `div.p-4:has(button:has-text("${lot}")) > input[type="checkbox"]`;
const bar = "div.sticky";

export default {
  start: "/aggregator/review",
  steps: [
    {
      say: "This video shows how to approve or reject several items at once in the Review Queue.",
      do: async (h) => {
        await h.page.waitForSelector("text=Lot 118");
        await h.pause(400);
      },
    },
    {
      say: "Tick the box on each item you want.",
      do: async (h) => {
        await h.click(box("Lot 118"));
        await h.click(box("Lot 302"));
      },
    },
    {
      say: "Or tick the box in the bar at the top of the list to select them all.",
      do: async (h) => h.point(`${bar} input[type="checkbox"]`, 1300),
    },
    {
      say: "The bar now shows Approve and Reject buttons, each with the number of items ticked. Clear unticks everything.",
      do: async (h) => {
        await h.point(`${bar} button:has-text("Approve")`, 700);
        await h.point(`${bar} button:has-text("Reject")`, 700);
        await h.point(`${bar} button:text-is("Clear")`, 700);
      },
    },
    {
      say: "Click Approve, then OK to confirm.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aggregator/review-queue?status=pending");
        await h.click(`${bar} button:has-text("Approve")`);
        await done.catch(() => {});
        await h.pause(700);
      },
    },
    {
      say: "Items approved this way are published exactly as they were read. Any edits you typed are not applied, so open an item first if it needs fixing.",
      do: async (h) => h.pause(1200),
    },
  ],
};
