/**
 * Overview of Credit Authorisation: a tour of the page. Nothing is created, changed or deleted. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

export default {
  start: "/credit-authorisation",
  steps: [
    {
      say: "This is Credit Authorisation. It holds the form a client signs to let us check their credit file.",
      do: async (h) => h.pause(500),
    },
    {
      say: "New authorisation, top right, starts a blank one. You can also create one from a fact find or a needs analysis.",
      do: async (h) => h.point('button:has-text("New authorisation")', 1300),
    },
    {
      say: "The buttons above the table filter the list to drafts or signed ones.",
      do: async (h) => {
        await h.point('button:has-text("Draft (")', 600);
        await h.point('button:has-text("Signed (")', 600);
      },
    },
    {
      say: "Each row shows the applicants, the status and the date.",
      do: async (h) => h.point('a:has-text("Olivia Bennett")', 1200),
    },
    {
      say: "Open one. The toolbar holds the status, Print to sign, Download PDF and Save.",
      do: async (h) => {
        await h.click('a:has-text("Olivia Bennett")');
        await h.page.waitForSelector('h3:has-text("Electronic signature")');
        await h.page.waitForLoadState("networkidle");
        await h.point("div.sticky select >> nth=0", 700);
        await h.point('button:text-is("Print to sign")', 700);
      },
    },
    {
      say: "The Electronic signature box is where you email the client a signing link and see whether they have signed.",
      do: async (h) => h.point('h3:has-text("Electronic signature")', 1300),
    },
    {
      say: "The form has the client's name and address at the top, then the standard wording they agree to.",
      do: async (h) => {
        await h.point('input[placeholder="Name/s"]', 800);
        await h.point('input[placeholder="Address"]', 800);
      },
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
