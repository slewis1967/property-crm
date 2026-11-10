/**
 * Review Queue: reject a property that should not be published. Demo data only.
 * The page asks for the reason in a browser pop-up, which a recording cannot
 * show, so the scenario answers it with a made-up reason.
 */
import { answerPrompts, waitForApi, centre } from "./lib/compliance-stock.mjs";

export default {
  start: "/aggregator/review",
  steps: [
    {
      say: "This video shows how to reject a property that should not be published.",
      do: async (h) => {
        await h.page.waitForSelector("text=Lot 81");
        await h.pause(400);
      },
    },
    {
      say: "Click the item to open it.",
      do: async (h) => {
        await h.click('button:has-text("Lot 81")');
        await h.page.waitForSelector("text=Approve & publish");
        await centre(h, 'button:text-is("Reject")');
      },
    },
    {
      say: "The line under the heading says why it was flagged. This one looks like a display home, not real stock.",
      do: async (h) => h.point("text=this row may be a display home", 1600),
    },
    {
      say: "Click Reject.",
      do: async (h) => {
        await answerPrompts(h, "Display home, not for sale");
        const done = waitForApi(h, "/api/aggregator/review-queue?status=pending");
        await h.click('button:text-is("Reject")');
        await done.catch(() => {});
      },
    },
    {
      say: "A box pops up asking for a reason. Type one if you like, and click OK. The item leaves the queue and is not published.",
      do: async (h) => h.pause(1200),
    },
    {
      say: "You can find it later under the Rejected tab. It cannot be moved back to pending on this screen.",
      do: async (h) => {
        await h.click('button:text-is("rejected")');
        await h.page.waitForSelector("text=Lot 81");
        await h.pause(900);
      },
    },
  ],
};
