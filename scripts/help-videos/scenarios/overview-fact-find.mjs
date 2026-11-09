/**
 * Overview of Fact Find: a tour of the page. Nothing is created, changed or deleted. Demo data only.
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
      say: "This is Fact Find. It records a borrower's full financial position before a loan is assessed.",
      do: async (h) => h.pause(500),
    },
    {
      say: "There are two ways to start one. From a contact fills in the client's details for you. New fact find opens a blank one.",
      do: async (h) => {
        await h.point('button:has-text("From a contact")', 900);
        await h.point('button:has-text("New fact find")', 900);
      },
    },
    {
      say: "The buttons above the table filter by status. Draft, In review or Complete.",
      do: async (h) => {
        await h.point('button:has-text("Draft (")', 600);
        await h.point('button:has-text("In review (")', 600);
        await h.point('button:has-text("Complete (")', 600);
      },
    },
    {
      say: "Each row shows the applicants, the status, the loan sought and who referred them.",
      do: async (h) => h.point('a:has-text("Bennett, Olivia")', 1400),
    },
    {
      say: "Open one. The toolbar at the top holds the status, Save, the PDF buttons, and buttons that carry the details into a Needs Analysis or a Credit Authorisation.",
      do: async (h) => {
        await h.click('a:has-text("Bennett, Olivia")');
        await h.page.waitForSelector('h3:has-text("Electronic signature")');
        await h.page.waitForLoadState("networkidle");
        await h.point("div.sticky select >> nth=0", 700);
        await h.point('button:has-text("Create Needs Analysis")', 700);
        await h.point('button:text-is("Download PDF")', 700);
      },
    },
    {
      say: "Under it are the change history and the Electronic signature box.",
      do: async (h) => h.point('h3:has-text("Electronic signature")', 1200),
    },
    {
      say: "Then the form itself, which works down from the applicants to the loan, the security property, the financial statements and the declarations.",
      do: async (h) => {
        await h.point('h2:has-text("Individual applicants")', 500);
        await h.scroll(700);
        await h.scroll(700);
      },
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
