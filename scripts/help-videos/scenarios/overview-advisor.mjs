/** Overview of Advisor. A tour only; nothing is changed. Uses seeded demo recommendations. */
const CARD = 'div.bg-white.border.rounded-xl:has(h3:has-text("Call hot leads within one business day"))';

export default {
  start: "/advisor",
  steps: [
    {
      say: "This is the Advisor page. Each week it lists suggested improvements for you to accept, park or reject.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The buttons along the top sort the list. Pending is where new suggestions wait, and the others show what is in progress, applied or dismissed.",
      do: async (h) => {
        await h.point('button:text-is("Pending")', 900);
        await h.point('button:text-is("In progress")', 700);
        await h.point('button:text-is("Applied")', 700);
        await h.point('button:text-is("Dismissed")', 700);
      },
    },
    {
      say: "Beside them is a count of the recommendations in the list you are looking at.",
      do: async (h) => h.point("span:has-text(' items')", 1500),
    },
    {
      say: "Each card is one recommendation, with a title and a line on what was noticed.",
      do: async (h) => h.point(`${CARD} h3`, 1800),
    },
    {
      say: "The coloured labels show its impact, the kind of change, how confident the advisor is, and whether the senior advisor has approved it.",
      do: async (h) => h.point(`${CARD} div.flex.items-center.gap-2`, 2500),
    },
    {
      say: "Click a card to open it. Inside you can read why it was suggested, the suggested action, and the senior advisor's verdict.",
      do: async (h) => {
        await h.click(`${CARD} h3`);
        await h.point(`${CARD} p:text-is("Why")`, 1000);
        await h.point(`${CARD} p:text-is("Suggested action")`, 1000);
      },
    },
    {
      say: "The buttons at the bottom of an open card are Start, Mark applied, Dismiss and Snooze.",
      do: async (h) => h.point(`${CARD} div.flex.gap-2.pt-2`, 2200),
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
