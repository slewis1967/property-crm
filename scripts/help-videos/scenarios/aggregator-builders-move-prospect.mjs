/** Builders: move a prospect builder through the agreement stages and onboard it. Demo data only. */
import { waitForApi, centre } from "./lib/compliance-stock.mjs";

const NAME = "Redgum & Co Builders";
const card = `div.rounded-xl:has(> div h3:text-is("${NAME}"))`;

export default {
  start: "/aggregator/builders",
  steps: [
    {
      say: "This video shows how to move a prospect builder to the next stage.",
      do: async (h) => {
        await h.page.waitForSelector(`h3:text-is("${NAME}")`);
        await h.pause(400);
      },
    },
    {
      say: "Find the builder under Prospect builders. The stage buttons above the cards narrow the list.",
      do: async (h) => {
        await h.point('button:has-text("In progress (")', 700);
        await centre(h, `h3:text-is("${NAME}")`);
        await h.point(`h3:text-is("${NAME}")`, 900);
      },
    },
    {
      say: "Once the agreement has been asked for, click Agreement requested on the card. The date is recorded.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aggregator/prospect-builders/", "POST");
        await h.click(`${card} button:text-is("Agreement requested")`);
        await done.catch(() => {});
      },
    },
    {
      say: "When the signed agreement is back, click Agreement signed.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aggregator/prospect-builders/", "POST");
        await h.click(`${card} button:text-is("Agreement signed")`);
        await done.catch(() => {});
      },
    },
    {
      say: "Undo steps back one stage. It only shows on the two agreement stages.",
      do: async (h) => h.point(`${card} button:text-is("Undo")`, 1300),
    },
    {
      say: "When they are ready to send stock, click Onboarded and confirm. There is no undo after this step.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aggregator/builders", "GET");
        await h.click(`${card} button:text-is("Onboarded")`);
        await done.catch(() => {});
        await h.pause(800);
      },
    },
    {
      say: "The builder now appears under Stock builders as an active supplier.",
      do: async (h) => h.point(`div.space-y-4 h3:text-is("${NAME}")`, 1800),
    },
  ],
};
