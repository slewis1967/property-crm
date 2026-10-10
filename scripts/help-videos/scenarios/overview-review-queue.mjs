/** Overview of the Review Queue: a tour of the page. Changes nothing. Demo data only. */
import { centre } from "./lib/compliance-stock.mjs";

const END = "For step by step help with a task here, pick it from the list under this overview.";
const item = 'div.p-4:has(button:has-text("Lot 231"))';

export default {
  start: "/aggregator/review",
  steps: [
    {
      say: "This is the Review Queue. It holds properties the system was not sure it read correctly from a builder's stocklist.",
      do: async (h) => {
        await h.page.waitForSelector("text=Lot 231");
        await h.pause(400);
      },
    },
    {
      say: "Pending is the work to do. Approved and Rejected show past decisions.",
      do: async (h) => {
        await h.point('button:text-is("pending")', 600);
        await h.point('button:text-is("approved")', 600);
        await h.point('button:text-is("rejected")', 600);
      },
    },
    {
      say: "Sort orders the list by confidence or by date.",
      do: async (h) => h.point("main select", 1200),
    },
    {
      say: "The bar above the list shows how many items there are. Tick some, and it offers Approve and Reject for those.",
      do: async (h) => h.point("div.sticky", 1500),
    },
    {
      say: "Each item shows a confidence score, the builder, lot and estate, why it was flagged, and the email it came from.",
      do: async (h) => {
        await h.point(`${item} span:has-text("confidence")`, 800);
        await h.point(`${item} p >> nth=0`, 800);
        await h.point(`${item} p >> nth=1`, 800);
      },
    },
    {
      say: "Click an item to see every field that was read, with the empty ones highlighted, and the Approve and Reject buttons.",
      do: async (h) => {
        await h.click('button:has-text("Lot 231")');
        await h.page.waitForSelector("text=Approve & publish");
        await centre(h, 'button:has-text("Approve & publish")');
        await h.point('button:has-text("Approve & publish")', 1000);
      },
    },
    {
      say: "Approved properties appear on the Aggregator Feed. The number beside Review Queue in the sidebar shows how many are still pending.",
      do: async (h) => h.point('aside a[href="/aggregator/review"]', 1800),
    },
    { say: END, do: async (h) => h.pause(600) },
  ],
};
