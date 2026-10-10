/**
 * AUSTRAC Reports: mark a report as lodged. Demo data only.
 * The page asks for the reference in a browser pop-up, which a recording cannot
 * show, so the scenario answers it with a made-up reference.
 */
import { hideVoiceButton, answerPrompts, waitForApi, centre } from "./lib/compliance-stock.mjs";

const row = 'tr:has-text("Lot 77 Heron Quarter")';

export default {
  start: "/aml/reports",
  steps: [
    {
      say: "This video shows how to mark a report as lodged once it has gone to AUSTRAC.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.page.waitForSelector(row);
      },
    },
    {
      say: "Find the report in the list. An overdue report shows in red in the Due column.",
      do: async (h) => {
        await centre(h, row);
        await h.point(`${row} td >> nth=3`, 1600);
      },
    },
    {
      say: "Click Mark lodged at the end of the row.",
      do: async (h) => {
        await answerPrompts(h, "TTR-DEMO-000457");
        const done = waitForApi(h, "/api/aml/reports", "GET");
        await h.click(`${row} button:has-text("Mark lodged")`);
        await done.catch(() => {});
        await h.page.waitForSelector(`${row} >> text=lodged`);
        await centre(h, row);
      },
    },
    {
      say: "A box pops up asking for the AUSTRAC lodgement reference. Type it in and click OK.",
      do: async (h) => h.pause(800),
    },
    {
      say: "The status changes to lodged and shows the reference.",
      do: async (h) => h.point(`${row} td >> nth=4`, 1600),
    },
    {
      say: "A lodged report cannot be changed or deleted on this screen, so check the reference before you click OK.",
      do: async (h) => h.point(`${row} td >> nth=5`, 1200),
    },
  ],
};
