/** Fact Find: start a fact find from a contact. Demo data only. */
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
      say: "This video shows how to start a fact find for a client.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click From a contact.",
      do: async (h) => h.click('button:has-text("From a contact")'),
    },
    {
      say: "Type the client's name, email or phone in the search box, then click them in the list.",
      do: async (h) => {
        await h.type('input[placeholder^="Search by name"]', "Charlotte");
        await h.click('button:has-text("Charlotte Walker")');
        await h.page.waitForURL(/\/fact-find\/[0-9a-f-]{36}$/);
        await h.page.waitForSelector('h2:has-text("Individual applicants")');
      },
    },
    {
      say: "The fact find opens with their name, contact details, occupation and income already filled in.",
      do: async (h) => {
        await h.point('label:has-text("Family name") input >> nth=0', 800);
        await h.point('label:has-text("Given name") input >> nth=0', 800);
      },
    },
    {
      say: "Work down the page and fill in each section, starting with the applicants.",
      do: async (h) => {
        await h.type('label:has-text("Title") input >> nth=0', "Ms");
        await h.point('h2:has-text("Individual applicants")', 300);
        await h.scroll(500);
        await h.scroll(500);
      },
    },
    {
      say: "Further down are the loan details, the security property, the financial statements and the declarations.",
      do: async (h) => {
        await h.type('label:has-text("Loan amount required") input', "540000");
        // Leave the number box before scrolling, or the wheel changes its value.
        await h.page.keyboard.press("Tab");
        await h.point('h2:has-text("Security offered for the loan")', 300);
        await h.scroll(600);
        await h.scroll(600);
      },
    },
    {
      say: "Click Save, at the right of the toolbar at the top. For someone who is not a contact yet, use New fact find instead.",
      do: async (h) => {
        const save = h.page.locator('button:text-is("Save")');
        if (await save.isEnabled().catch(() => false)) await h.click('button:text-is("Save")');
        else await h.point('button:text-is("Save"), button:text-is("Saving…")', 900);
        await h.pause(900);
      },
    },
  ],
};
