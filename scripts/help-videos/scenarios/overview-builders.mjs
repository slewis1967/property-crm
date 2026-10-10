/** Overview of Builders: a tour of the page. Changes nothing. Demo data only. */
import { centre } from "./lib/compliance-stock.mjs";

const END = "For step by step help with a task here, pick it from the list under this overview.";
const prospect = 'div.rounded-xl:has(> div h3:text-is("Coolabah Homes"))';
const builder = 'div.space-y-4 > div:has(h3:text-is("Bluegum Homes"))';
const draft = 'div.space-y-4 > div:has-text("DRAFT")';

export default {
  start: "/aggregator/builders",
  steps: [
    {
      say: "This is Builders. The top half tracks builders we are signing up. The bottom half manages the ones we already get stock from.",
      do: async (h) => {
        await h.page.waitForSelector('h3:text-is("Coolabah Homes")');
        await h.page.waitForSelector("text=DRAFT");
        await h.pause(400);
      },
    },
    {
      say: "Prospect builders are the ones still signing an agreement. The heading shows how many are in progress.",
      do: async (h) => h.point('h2:has-text("Prospect builders")', 1500),
    },
    {
      say: "The stage buttons narrow the cards to one stage.",
      do: async (h) => {
        await h.point('button:has-text("In progress (")', 500);
        await h.point('button:has-text("Agreement signed (")', 500);
        await h.point('button:has-text("Onboarded (")', 500);
      },
    },
    {
      say: "A prospect card shows the company, its contacts and terms, with a button to move it to the next stage.",
      do: async (h) => {
        await h.point(`${prospect} h3`, 900);
        await h.point(`${prospect} button:text-is("Onboarded")`, 900);
      },
    },
    {
      say: "Stock builders send us stocklists. Onboarded prospects appear here, and so do builders picked up from incoming emails.",
      do: async (h) => {
        await centre(h, 'h2:has-text("Stock builders")');
        await h.point('h2:has-text("Stock builders")', 1500);
      },
    },
    {
      say: "A builder card shows their contact details and when the last stocklist arrived.",
      do: async (h) => {
        await centre(h, builder);
        await h.point(`${builder} h3`, 700);
        await h.point(`${builder} p:has-text("Last stocklist received")`, 900);
      },
    },
    {
      say: "A draft card has an amber border. It was created by the system and needs checking.",
      do: async (h) => {
        await centre(h, draft);
        await h.point(`${draft} span:has-text("DRAFT")`, 1300);
      },
    },
    {
      say: "Each builder card has three buttons, Edit, Deactivate and Pause auto emails.",
      do: async (h) => {
        await centre(h, builder);
        await h.point(`${builder} button:text-is("Edit")`, 600);
        await h.point(`${builder} button:text-is("Deactivate")`, 600);
        await h.point(`${builder} button:text-is("Pause auto-emails")`, 600);
      },
    },
    { say: END, do: async (h) => h.pause(600) },
  ],
};
