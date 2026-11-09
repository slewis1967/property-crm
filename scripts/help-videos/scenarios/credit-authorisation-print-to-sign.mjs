/**
 * Credit Authorisation: print an authorisation to sign on paper, then mark it signed. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const status = "div.sticky select >> nth=0";

export default {
  start: "/credit-authorisation",
  steps: [
    {
      say: "This video shows how to print a Credit Authorisation when the client is signing in person.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Open the authorisation.",
      do: async (h) => {
        await h.click('a:has-text("Isla Robinson and Ethan Clarke")');
        await h.page.waitForSelector('button:text-is("Print to sign")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click Print to sign. The print window opens with just the form. Print it and have the client sign.",
      do: async (h) => {
        await h.page.evaluate(() => (window.print = () => {}));
        await h.click('button:text-is("Print to sign")');
        await h.pause(600);
      },
    },
    {
      say: "Once it is signed, change the status in the toolbar to Signed. The authorisation is then locked.",
      do: async (h) => {
        await h.select(status, "signed");
        await h.page.waitForSelector('button:has-text("Reopen to amend")', { timeout: 15000 });
      },
    },
    {
      say: "To change it later, click Reopen to amend.",
      do: async (h) => h.point('button:has-text("Reopen to amend")', 1300),
    },
  ],
};
