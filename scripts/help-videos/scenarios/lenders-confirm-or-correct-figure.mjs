/**
 * Lender Policy: confirm a policy figure. Saves a real broker confirmation in
 * the demo database (the seed file removes it). No client records on screen;
 * the lender is from the research pack committed in the repo.
 */
import { setDate, isoDay } from "../lib/command-util.mjs";

const ROW = 'div.px-4.py-3:has(span:text-matches("^assessment buffer %$", "i"))';
const FORM = `${ROW} div.bg-blue-50`;

export default {
  start: "/lenders",
  steps: [
    {
      say: "This is the Lender Policy library. Here is how to confirm or correct a policy figure you have checked yourself.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Find the lender and click it to open its record.",
      do: async (h) => {
        await h.type('input[placeholder^="Search lenders"]', "Macquarie");
        await h.click('a[href="/lenders/macquarie-bank"]');
        await h.page.waitForURL(/\/lenders\/macquarie-bank$/);
        await h.page.waitForSelector(ROW);
      },
    },
    {
      say: "Find the figure, and click Confirm or correct on the line underneath it.",
      do: async (h) => h.click(`${ROW} button:has-text("Confirm / correct")`),
    },
    {
      say: "Check the value in the first box, and type the correct one if it is wrong.",
      do: async (h) => h.point(`${FORM} input >> nth=0`, 1500),
    },
    {
      say: "Choose the date the policy was current. You cannot confirm without a date.",
      do: async (h) => setDate(h, `${FORM} input[type="date"]`, isoDay(0)),
    },
    {
      say: "Paste the web address of the page you read it on, and add a note if you like.",
      do: async (h) => {
        await h.point(`${FORM} input[placeholder^="Source URL"]`, 1000);
        await h.type(`${FORM} input[placeholder^="Note"]`, "Checked against the current credit guidelines.");
      },
    },
    {
      say: "Click Confirm.",
      do: async (h) => {
        await h.click(`${FORM} button:text-is("Confirm")`);
        await h.page.waitForSelector(`${ROW} span:text-is("Broker confirmed")`);
      },
    },
    {
      say: "The figure is now marked Broker confirmed, and it is kept when the research is next refreshed.",
      do: async (h) => h.point(`${ROW} span:text-is("Broker confirmed")`, 1800),
    },
  ],
};
