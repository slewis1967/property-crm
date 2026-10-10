/**
 * Opportunities: hide leads that do not qualify, or delete a record made by mistake.
 * Demo data; NEXUS is the local stand-in.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const card = (name) => `div[draggable="true"]:has(p:text-is("${name}"))`;
const tick = (name) => `${card(name)} button[title="Select"]`;

export default {
  start: "/opportunities",
  steps: [
    {
      say: "This video shows how to hide or delete opportunities you no longer need on the board.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Hover over a card and tick the small box at its top left. A blue bar appears at the top.",
      do: async (h) => {
        await h.page.locator(card("Taylor Example")).scrollIntoViewIfNeeded();
        await h.page.locator(card("Taylor Example")).hover();
        await h.click(tick("Taylor Example"));
      },
    },
    {
      say: "Click Mark D N Q to hide it. That stands for do not qualify. The card is hidden, not deleted.",
      do: async (h) => {
        await h.click('button:has-text("Mark DNQ")');
        await h.page.waitForSelector(card("Taylor Example"), { state: "detached", timeout: 8000 });
      },
    },
    {
      say: "To bring one back, click the D N Q button in the toolbar, tick the card, then click Restore.",
      do: async (h) => {
        await h.click('button[title="Show leads marked Do Not Qualify"]');
        await h.point(card("Taylor Example"), 900);
        await h.click('button[title="Back to board"]');
      },
    },
    {
      say: "To remove a record for good, tick it and click Delete in the blue bar.",
      do: async (h) => {
        await h.page.locator(card("Sample Duplicate")).scrollIntoViewIfNeeded();
        await h.page.locator(card("Sample Duplicate")).hover();
        await h.click(tick("Sample Duplicate"));
        await h.click('button:has-text("Delete 1")');
      },
    },
    {
      say: "Fill in the reason for deletion and your name. Both are required and are kept on record.",
      do: async (h) => {
        await h.type('textarea[placeholder^="e.g. Duplicate record"]', "Duplicate record, entered twice.");
        await h.type('input[placeholder="Who is deleting this?"]', "Demo User");
      },
    },
    {
      say: "Click Delete. This permanently deletes the opportunity and cannot be undone.",
      do: async (h) => {
        await h.click('div.fixed.inset-0 button:text-is("Delete")');
        await h.page.waitForSelector(card("Sample Duplicate"), { state: "detached", timeout: 10000 });
        await h.pause(600);
      },
    },
  ],
};
