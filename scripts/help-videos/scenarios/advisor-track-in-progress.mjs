/** Advisor: start a recommendation, then complete it. Uses seeded demo recommendations. */
const CARD = 'div.bg-white.border.rounded-xl:has(h3:has-text("Fill in missing budgets on new contacts"))';
const OLDER = 'div.bg-white.border.rounded-xl:has(h3:has-text("Tidy up duplicate contacts"))';

export default {
  start: "/advisor",
  steps: [
    {
      say: "This is the Advisor page. Here is how to track a recommendation you are working on.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click the recommendation to open it.",
      do: async (h) => h.click(`${CARD} h3`),
    },
    {
      say: "Click Start. It moves out of Pending.",
      do: async (h) => {
        await h.click(`${CARD} button:has-text("Start")`);
        await h.page.waitForSelector(CARD, { state: "detached" });
      },
    },
    {
      say: "Click In progress in the top row. Each item shows how long it has been under way.",
      do: async (h) => {
        await h.click('button:text-is("In progress")');
        await h.point(`${OLDER} span:has-text("in progress")`, 1400);
      },
    },
    {
      say: "When the work is done, open the item and click Complete. It moves to Applied.",
      do: async (h) => {
        // The item is still open from before; only click it if it has closed.
        const complete = h.page.locator(`${CARD} button:has-text("Complete")`);
        if (!(await complete.isVisible())) await h.click(`${CARD} h3`);
        await h.point(`${CARD} button:has-text("Complete")`, 1000);
      },
    },
    {
      say: "If you are not going ahead after all, click Back to pending instead. You are asked to confirm first.",
      do: async (h) => h.point(`${CARD} button:has-text("Back to pending")`, 1500),
    },
    {
      say: "Here we click Complete, and the recommendation leaves the In progress list.",
      do: async (h) => {
        await h.click(`${CARD} button:has-text("Complete")`);
        await h.page.waitForSelector(CARD, { state: "detached" });
        await h.pause(700);
      },
    },
  ],
};
