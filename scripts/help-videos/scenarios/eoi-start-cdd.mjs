/**
 * Expressions of Interest: start the identity check (CDD) from an EOI. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const ID = "e4000000-0000-4000-8000-000000000002";

export default {
  start: "/eoi",
  steps: [
    {
      say: "This video shows how to start the identity check for a buyer from their Expression of Interest.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click the EOI in the list to open it.",
      do: async (h) => {
        await h.click('a:has-text("Liam Nguyen")');
        await h.page.waitForSelector('button:has-text("Start CDD from this EOI")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click Start C D D from this EOI, at the top right. C D D means customer due diligence.",
      do: async (h) => {
        await h.click('button:has-text("Start CDD from this EOI")');
        await h.page.waitForURL(/\/aml\/[0-9a-f-]{36}/, { timeout: 20000 });
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "A new case opens, already filled in from the EOI.",
      do: async (h) => h.pause(1500),
    },
    {
      say: "Next time you open the EOI, the button says View C D D case. Click it to go back to the case.",
      do: async (h) => {
        await h.goto(`/eoi/${ID}`);
        await h.point('a:has-text("View CDD case")', 1500);
      },
    },
  ],
};
