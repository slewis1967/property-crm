/** Lead Intake: promote a new enquiry into the working pipeline. Demo data; NEXUS is the local stand-in. */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const row = 'tr:has-text("Sophie Turner-Demo")';

export default {
  start: "/leads",
  steps: [
    {
      say: "This video shows how to move a new enquiry into the working pipeline.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click To triage. This shows only the leads nobody has promoted yet.",
      do: async (h) => h.click('button:text-is("To triage")'),
    },
    {
      say: "Read across the row. Score, Match and Top Match show how the lead was rated.",
      do: async (h) => {
        await h.point(`${row} td >> nth=5`, 700);
        await h.point(`${row} td >> nth=6`, 700);
        await h.point(`${row} td >> nth=7`, 700);
      },
    },
    {
      say: "Beside Promote into, choose the pipeline. The lead goes into the first stage of that pipeline.",
      do: async (h) => h.select('label:has-text("Promote into") select', { label: "Sales Pipeline" }),
    },
    {
      say: "Click Promote at the end of the row.",
      do: async (h) => {
        await h.page.locator(".overflow-x-auto").first().evaluate((el) => (el.scrollLeft = el.scrollWidth));
        await h.click(`${row} button:has-text("Promote")`);
        await h.page.waitForSelector("text=Promoted “Sophie", { timeout: 10000 });
      },
    },
    {
      say: "A green message confirms it, and the lead leaves the To triage list.",
      do: async (h) => h.point("div.bg-green-50", 1200),
    },
    {
      say: "Click Working pipeline to see the new card on the Opportunities board.",
      do: async (h) => {
        await h.click('a:has-text("Working pipeline")');
        await h.page.waitForURL("**/opportunities");
        await h.page.waitForLoadState("networkidle");
        await h.point('p:has-text("Sophie Turner-Demo")', 1200);
      },
    },
  ],
};
