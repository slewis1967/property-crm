/**
 * Needs Analysis: mark a Needs Analysis complete and download the PDF. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const status = "div.sticky select >> nth=0";

export default {
  start: "/needs-analysis",
  steps: [
    {
      say: "This video shows how to mark a Needs Analysis complete and download a copy.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Open the Needs Analysis.",
      do: async (h) => {
        await h.click('a:has-text("Nguyen, Liam")');
        await h.page.waitForSelector('h2:has-text("Interview")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "In the toolbar, change the status to Complete. The document is then locked.",
      do: async (h) => {
        await h.select(status, "Complete");
        await h.page.waitForSelector('button:has-text("Reopen to amend")', { timeout: 15000 });
        await h.point("text=can't be edited", 1000);
      },
    },
    {
      say: "Click Download PDF. The PDF saves to your computer.",
      do: async (h) => {
        await h.click('button:text-is("Download PDF")');
        await h.pause(1500);
      },
    },
    {
      say: "To change it later, click Reopen to amend.",
      do: async (h) => h.point('button:has-text("Reopen to amend")', 1300),
    },
  ],
};
