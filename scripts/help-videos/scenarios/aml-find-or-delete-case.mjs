/** CDD Cases: filter the list and delete a case made by mistake. Demo data only. */
import { hideVoiceButton, waitForApi } from "./lib/compliance-stock.mjs";

const DUPLICATE = "Olivia Bennett (duplicate)";

export default {
  start: "/aml",
  steps: [
    {
      say: "This video shows how to find a case, and how to delete one made by mistake.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.page.waitForSelector(`a:has-text("${DUPLICATE}")`);
      },
    },
    {
      say: "Click a status button above the list to narrow it. Each button shows how many cases it holds.",
      do: async (h) => {
        await h.click('button:has-text("In Progress (")');
        await h.pause(900);
        await h.click('button:has-text("All (")');
      },
    },
    {
      say: "A review due tag in the Updated column marks a case whose review date has arrived.",
      do: async (h) => h.point("text=review due", 1600),
    },
    {
      say: "Click the party name to open a case.",
      do: async (h) => h.point('main a:has-text("Wren Family Trust")', 1300),
    },
    {
      say: "To remove a case made by mistake, click Delete at the end of its row.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aml/cases/", "DELETE");
        await h.click(`tr:has-text("${DUPLICATE}") button:has-text("Delete")`);
        await done.catch(() => {});
        await h.point('button:has-text("All (")', 600);
      },
    },
    {
      say: "You are asked to confirm, and then the case is gone. This cannot be undone, and a cleared case cannot be deleted.",
      do: async (h) => h.pause(1500),
    },
  ],
};
