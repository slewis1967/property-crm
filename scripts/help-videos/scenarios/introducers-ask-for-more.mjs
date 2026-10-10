/**
 * Introducers: ask an introducer for missing details or documents. Demo data only; no email can leave the demo.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const box = 'div:has(> h2:text-is("Ask for more"))';

export default {
  start: "/admin/introducers",
  steps: [
    {
      say: "This video shows how to ask an introducer for more information on a referral.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Review queue, then click the referral.",
      do: async (h) => {
        await h.click('button:has-text("Review queue")');
        await h.click('a:has-text("Hannah Example-Cole")');
        await h.page.waitForURL("**/admin/introducers/submissions/**");
        await h.page.waitForSelector('h2:text-is("Ask for more")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Find the Ask for more box, and type what you need and why.",
      do: async (h) => h.type(`${box} textarea[placeholder^="What do you need"]`, "We need a mobile number so we can call Hannah."),
    },
    {
      say: "Click Missing details to request and tick the items you need. Only details that are still blank are listed.",
      do: async (h) => {
        await h.click(`${box} summary`);
        await h.click(`${box} details label:has-text("Mobile") input`);
      },
    },
    {
      say: "List any paperwork you need under Documents, one per line.",
      do: async (h) => h.type(`${box} label:has-text("Documents") textarea`, "Proof of income"),
    },
    {
      say: "Click Request from introducer. Only the items you asked for are opened for them to fill in.",
      do: async (h) => {
        await h.click(`${box} button:has-text("Request from introducer")`);
        await h.page.waitForSelector(`${box} button:has-text("Cancel this request")`, { timeout: 15000 });
        await h.point(`${box} li >> nth=0`, 1200);
      },
    },
  ],
};
