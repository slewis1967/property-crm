/**
 * Client Documents: cancel a document request. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const row = (ref) => `ul.space-y-2 > li:has-text("${ref}")`;
const r = row("NK-DEMO-0103");

export default {
  start: "/document-requests",
  steps: [
    {
      say: "This video shows how to cancel a document request you no longer need.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Find the client in the list.",
      do: async (h) => h.point(`${r} p.font-medium`, 1200),
    },
    {
      say: "Click Cancel at the right of their row, then confirm when you are asked.",
      do: async (h) => {
        await h.click(`${r} button:text-is("Cancel")`);
        await h.page.waitForSelector(`${r} >> text=cancelled`, { timeout: 10000 });
      },
    },
    {
      say: "The request now shows as cancelled, and the client's upload link stops working.",
      do: async (h) => h.point(`${r} span:text-is("cancelled")`, 1500),
    },
    {
      say: "A request that has already been submitted or cancelled has no Cancel button.",
      do: async (h) => h.point(`${row("NK-DEMO-0104")} span:text-is("submitted")`, 1500),
    },
  ],
};
