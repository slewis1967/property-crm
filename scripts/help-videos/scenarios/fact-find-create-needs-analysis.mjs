/**
 * Fact Find: create a Needs Analysis from a fact find. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

export default {
  start: "/fact-find",
  steps: [
    {
      say: "This video shows how to carry a fact find's details into a new Needs Analysis, so you do not type them twice.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Open the fact find.",
      do: async (h) => {
        await h.click('a:has-text("Bennett, Olivia")');
        await h.page.waitForSelector('button:has-text("Create Needs Analysis")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click Create Needs Analysis, in the toolbar at the top.",
      do: async (h) => {
        await h.click('button:has-text("Create Needs Analysis")');
        await h.page.waitForSelector("text=Needs Analysis created as a Draft", { timeout: 20000 });
      },
    },
    {
      say: "Read the amber box that appears. It lists the items to review in the new Needs Analysis.",
      do: async (h) => h.point("text=Needs Analysis created as a Draft", 1800),
    },
    {
      say: "Click Open Needs Analysis.",
      do: async (h) => {
        await h.click('button:has-text("Open Needs Analysis")');
        await h.page.waitForURL(/\/needs-analysis\/[0-9a-f-]{36}$/);
        await h.page.waitForSelector('h2:has-text("Interview")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "The new Needs Analysis opens with the applicant's details carried across.",
      do: async (h) => {
        await h.point('h2:has-text("Interview")', 300);
        await h.scroll(600);
        await h.pause(900);
      },
    },
  ],
};
