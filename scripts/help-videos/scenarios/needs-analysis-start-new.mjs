/** Needs Analysis: start a new one and fill in the first sections. Demo data only. */
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
      say: "This video shows how to start a Needs Analysis with a client.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click New needs analysis. A blank one opens.",
      do: async (h) => {
        await h.click('button:has-text("New needs analysis")');
        await h.page.waitForURL(/\/needs-analysis\/[0-9a-f-]{36}$/);
        await h.page.waitForSelector('h2:has-text("Interview")');
      },
    },
    {
      say: "Fill in the Interview section, then write why the client needs the loan under Needs and objectives.",
      do: async (h) => {
        await h.click('label:has-text("Phone") input[type="radio"]');
        await h.type('label:has-text("Why do you need a loan?") textarea', "Buying a larger family home.");
      },
    },
    {
      say: "Under Loan basics, enter the loan amount sought and answer the two questions.",
      do: async (h) => {
        await h.type('label:has-text("Loan amount sought") input', "650000");
        await h.page.keyboard.press("Tab");
      },
    },
    {
      say: "Fill in the Applicants section. There is room for two applicants side by side.",
      do: async (h) => {
        await h.type('label:has-text("Surname") input >> nth=0', "Thompson");
        await h.type('label:has-text("Given name") input >> nth=0', "Amelia");
      },
    },
    {
      say: "Keep going down the page for other income, assets and liabilities.",
      do: async (h) => {
        await h.point('h2:has-text("Applicants")', 300);
        await h.scroll(900);
        await h.scroll(900);
        await h.scroll(900);
      },
    },
    {
      say: "Your work saves as you go. You can also click Save, at the right of the toolbar at the top.",
      do: async (h) => {
        await h.point('button:text-is("Save"), button:text-is("Saving…")', 1200);
      },
    },
  ],
};
