/** Builders: pause the automatic emails to a builder, or switch the builder off. Demo data only. */
import { centre, waitForApi } from "./lib/compliance-stock.mjs";

const NAME = "Saltbush Constructions";
const card = `div.space-y-4 > div:has(h3:text-is("${NAME}"))`;

async function press(h, label) {
  const done = waitForApi(h, "/api/aggregator/builders", "GET");
  await h.click(`${card} button:text-is("${label}")`);
  await done.catch(() => {});
  await h.page.waitForSelector(card);
  await centre(h, card);
}

export default {
  start: "/aggregator/builders",
  steps: [
    {
      say: "This video shows how to pause the automatic emails to a builder, or switch a builder off.",
      do: async (h) => {
        await h.page.waitForSelector(`h3:text-is("${NAME}")`);
        await h.pause(400);
      },
    },
    {
      say: "Find the builder under Stock builders. The card shows when the last stocklist arrived and whether auto outreach is enabled.",
      do: async (h) => {
        await centre(h, card);
        await h.point(`${card} p:has-text("Last stocklist received")`, 800);
        await h.point(`${card} p:has-text("Auto-outreach")`, 800);
      },
    },
    {
      say: "Click Pause auto emails to stop the automatic stocklist requests.",
      do: async (h) => press(h, "Pause auto-emails"),
    },
    {
      say: "The button changes to Resume auto emails, and the card shows paused.",
      do: async (h) => h.point(`${card} button:text-is("Resume auto-emails")`, 1400),
    },
    {
      say: "Click Deactivate to mark the builder inactive. The card then shows an inactive tag.",
      do: async (h) => {
        await press(h, "Deactivate");
        await h.point(`${card} span:text-is("inactive")`, 1200);
      },
    },
    {
      say: "Click Activate and Resume auto emails to switch them back on.",
      do: async (h) => {
        await press(h, "Activate");
        await press(h, "Resume auto-emails");
      },
    },
  ],
};
