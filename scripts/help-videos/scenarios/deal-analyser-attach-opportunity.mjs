/**
 * Deal Analyser: attach a deal packet to a client's opportunity. Demo data; NEXUS is the local stand-in.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const ID = "da000000-0000-4000-8000-000000000002";

export default {
  start: "/deal-analyser",
  steps: [
    {
      say: "This video shows how to link a deal packet to a client, so the reports sit with their record.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click the deal packet in the list.",
      do: async (h) => {
        await h.click(`a[href="/deal-analyser/${ID}"]`);
        await h.page.waitForURL(`**/deal-analyser/${ID}`);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Under Opportunity, at the top of the page, click Attach to an opportunity.",
      do: async (h) => h.click('button:has-text("Attach to an opportunity")'),
    },
    {
      say: "Type the client's name or email in the search box.",
      do: async (h) => h.type('input[placeholder^="Search opportunities"]', "Liam"),
    },
    {
      say: "Click the right client in the list. The page shows Attached when it is saved.",
      do: async (h) => {
        await h.click('li button:has-text("Liam Nguyen")');
        await h.page.waitForSelector("text=Attached", { timeout: 10000 });
        await h.point("text=Attached", 900);
      },
    },
    {
      say: "To undo it, click Detach. Click Change to pick a different client.",
      do: async (h) => {
        await h.point('button:text-is("Change")', 700);
        await h.point('button:text-is("Detach")', 900);
      },
    },
  ],
};
