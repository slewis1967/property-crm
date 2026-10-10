/**
 * Lead Intake: see every lead and which ones have been promoted. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

export default {
  start: "/leads",
  steps: [
    {
      say: "This video shows how to see every enquiry, including the ones already in the pipeline.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The three boxes at the top show how many leads are still to triage, how many are matched, and how many are promoted.",
      do: async (h) => {
        await h.point('p:text-is("To triage")', 600);
        await h.point('p:text-is("Matched")', 600);
        await h.point('p:text-is("Promoted")', 600);
      },
    },
    {
      say: "Click All leads. The table now includes leads that were already promoted.",
      do: async (h) => h.click('button:text-is("All leads")'),
    },
    {
      say: "Look for In pipeline at the end of a row. That lead has already been promoted.",
      do: async (h) => {
        await h.page.locator(".overflow-x-auto").first().evaluate((el) => (el.scrollLeft = el.scrollWidth));
        await h.page.locator('a:has-text("In pipeline")').first().evaluate((el) => el.scrollIntoView({ block: "center" }));
        await h.point('a:has-text("In pipeline") >> nth=0', 1300);
      },
    },
    {
      say: "Click In pipeline to go to the Opportunities board.",
      do: async (h) => {
        await h.click('a:has-text("In pipeline") >> nth=0');
        await h.page.waitForURL("**/opportunities");
        await h.page.waitForLoadState("networkidle");
        await h.pause(900);
      },
    },
  ],
};
