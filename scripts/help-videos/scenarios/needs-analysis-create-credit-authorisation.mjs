/**
 * Needs Analysis: create a Credit Authorisation from a Needs Analysis. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

export default {
  start: "/needs-analysis",
  steps: [
    {
      say: "This video shows how to start a Credit Authorisation from a Needs Analysis, with the names and address already filled in.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Open the Needs Analysis.",
      do: async (h) => {
        await h.click('a:has-text("Nguyen, Liam")');
        await h.page.waitForSelector('button:has-text("Create Credit Authorisation")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click Create Credit Authorisation, in the toolbar at the top.",
      do: async (h) => {
        await h.click('button:has-text("Create Credit Authorisation")');
        await h.page.waitForURL(/\/credit-authorisation\/[0-9a-f-]{36}$/, { timeout: 20000 });
        await h.page.waitForSelector('input[placeholder="Name/s"]');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "The new authorisation opens. Check the names and the address are right.",
      do: async (h) => {
        await h.point('input[placeholder="Name/s"]', 1000);
        await h.point('input[placeholder="Address"]', 1000);
      },
    },
    {
      say: "From here you can send it for signature, or print it to sign on paper.",
      do: async (h) => {
        await h.point('button:text-is("Send for signature")', 800);
        await h.point('button:text-is("Print to sign")', 800);
      },
    },
  ],
};
