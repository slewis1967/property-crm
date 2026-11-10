/**
 * Overview of Needs Analysis: a tour of the page. Nothing is created, changed or deleted. Demo data only.
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
      say: "This is Needs Analysis. It records what the client needs from their loan, along with their income, assets and debts.",
      do: async (h) => h.pause(500),
    },
    {
      say: "New needs analysis, top right, starts a blank one. You can also create one from a fact find.",
      do: async (h) => h.point('button:has-text("New needs analysis")', 1300),
    },
    {
      say: "The buttons above the table filter by status.",
      do: async (h) => {
        await h.point('button:has-text("Draft (")', 600);
        await h.point('button:has-text("Complete (")', 600);
      },
    },
    {
      say: "Each row shows the applicants, the status and the loan sought.",
      do: async (h) => h.point('a:has-text("Nguyen, Liam")', 1300),
    },
    {
      say: "Open one. The toolbar holds the status, a button to create a Credit Authorisation, the PDF buttons and Save.",
      do: async (h) => {
        await h.click('a:has-text("Nguyen, Liam")');
        await h.page.waitForSelector('h3:has-text("Electronic signature")');
        await h.page.waitForLoadState("networkidle");
        await h.point("div.sticky select >> nth=0", 700);
        await h.point('button:has-text("Create Credit Authorisation")', 700);
        await h.point('button:text-is("Download PDF")', 700);
      },
    },
    {
      say: "Under it are the change history and the Electronic signature box.",
      do: async (h) => h.point('h3:has-text("Electronic signature")', 1200),
    },
    {
      say: "The form starts with the interview, the client's needs and the loan basics, then the applicants, their income, assets and liabilities.",
      do: async (h) => {
        await h.point('h2:text-is("Interview")', 500);
        await h.scroll(700);
        await h.scroll(700);
      },
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
