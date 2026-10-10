/** Advisor: review a recommendation and mark it applied. Uses seeded demo recommendations. */
const CARD = 'div.bg-white.border.rounded-xl:has(h3:has-text("Call hot leads within one business day"))';

export default {
  start: "/advisor",
  steps: [
    {
      say: "This is the Advisor page. Here is how to review a recommendation and record that you have acted on it.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Pending is selected when you arrive. It lists the recommendations waiting for you.",
      do: async (h) => h.click('button:text-is("Pending")'),
    },
    {
      say: "Click a recommendation to open it. The coloured labels show its impact and whether the senior advisor has approved it.",
      do: async (h) => {
        await h.click(`${CARD} h3`);
        await h.pause(600);
      },
    },
    {
      say: "Read Why, and then the Suggested action.",
      do: async (h) => {
        await h.point(`${CARD} p:text-is("Why")`, 1100);
        await h.point(`${CARD} p:text-is("Suggested action")`, 1300);
      },
    },
    {
      say: "Once you have made the change yourself, click Mark applied.",
      do: async (h) => {
        await h.click(`${CARD} button:has-text("Mark applied")`);
        await h.page.waitForSelector(CARD, { state: "detached" });
      },
    },
    {
      say: "If the button says Apply and run action instead, it changes the CRM straight away, so read the confirmation first.",
      do: async (h) => h.pause(400),
    },
    {
      say: "Click Applied in the top row to check the recommendation is there.",
      do: async (h) => {
        await h.click('button:text-is("Applied")');
        await h.point('h3:has-text("Call hot leads within one business day")', 1400);
      },
    },
  ],
};
