/** AUSTRAC Reports: delete a report record made by mistake. Demo data only. */
import { hideVoiceButton, waitForApi, centre } from "./lib/compliance-stock.mjs";

const row = 'tr:has-text("Entered twice by mistake")';

export default {
  start: "/aml/reports",
  steps: [
    {
      say: "This video shows how to delete a report record that was made by mistake. You can only do this before a report is lodged.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.page.waitForSelector(row);
      },
    },
    {
      say: "Find the report in the list.",
      do: async (h) => h.point(`${row} td >> nth=1`, 2500),
    },
    {
      say: "Only reports that are not lodged have a Delete link. A lodged report has none.",
      do: async (h) => {
        await centre(h, 'tr:has-text("TTR-DEMO-000123")');
        await h.point('tr:has-text("TTR-DEMO-000123") td >> nth=4', 1200);
        await h.point(`${row} button:has-text("Delete")`, 900);
      },
    },
    {
      say: "Click Delete at the end of the row.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aml/reports/", "DELETE");
        await h.click(`${row} button:has-text("Delete")`);
        await done.catch(() => {});
      },
    },
    {
      say: "You are asked to confirm. Click OK and the report is removed. This cannot be undone.",
      do: async (h) => h.pause(1500),
    },
    {
      say: "If you deleted the wrong one, add it again with the New report form at the top.",
      do: async (h) => {
        await centre(h, 'h2:has-text("New report")');
        await h.point('h2:has-text("New report")', 1300);
      },
    },
  ],
};
