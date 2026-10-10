/** Review Queue: check one flagged property, fix it and publish it. Demo data only. */
import { waitForApi } from "./lib/compliance-stock.mjs";

const field = (label) => `label:has(span:has-text("${label}")) input`;

export default {
  start: "/aggregator/review",
  steps: [
    {
      say: "This video shows how to check and approve a property in the Review Queue.",
      do: async (h) => {
        await h.page.waitForSelector("text=Lot 231");
        await h.pause(400);
      },
    },
    {
      say: "Click an item in the list to open it. The line under the heading says why it was flagged.",
      do: async (h) => {
        await h.click('button:has-text("Lot 231")');
        await h.page.waitForSelector("text=Approve & publish");
      },
    },
    {
      say: "Check each field against the builder's stocklist. Fields marked empty could not be read.",
      do: async (h) => {
        await h.point(field("Land size (sqm)"), 900);
        await h.point(field("Total package"), 900);
      },
    },
    {
      say: "Type the correct value into any field that is wrong or empty. Put the price in House price and Land price. An item cannot be approved without one.",
      do: async (h) => {
        await h.type(field("Land size (sqm)"), "448");
        await h.type(field("House price"), "362500");
        await h.type(field("Land price"), "306000");
      },
    },
    {
      say: "Click Approve and publish.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aggregator/review-queue?status=pending");
        await h.click('button:has-text("Approve & publish")');
        await done.catch(() => {});
        await h.pause(800);
      },
    },
    {
      say: "The item leaves the queue and the property goes into the Aggregator Feed with your corrections.",
      do: async (h) => h.pause(1200),
    },
  ],
};
