/**
 * Partners: onboard a new partner firm. Demo data only; no email can leave the demo.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const form = 'div.rounded-xl:has(> div:text-is("Onboard a partner firm"))';

export default {
  start: "/admin/partners",
  steps: [
    {
      say: "This video shows how to set up a new partner firm and give them a portal login.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Partner firms.",
      do: async (h) => h.click('button:has-text("Partner firms")'),
    },
    {
      say: "Click Onboard a partner. Only the business owner sees this button.",
      do: async (h) => h.click('button:text-is("Onboard a partner")'),
    },
    {
      say: "Fill in the firm name and the contact email. The email becomes their login, and both are required.",
      do: async (h) => {
        await h.type(`${form} label:has-text("Firm name") input`, "Northside Example Planners");
        await h.type(`${form} label:has-text("Contact name") input`, "Jordan Example");
        await h.type(`${form} label:has-text("Contact email") input`, "jordan@demo-partner.example.com");
      },
    },
    {
      say: "Choose the tier.",
      do: async (h) => h.point(`${form} label:has-text("Tier") select`, 1000),
    },
    {
      say: "Leave the box ticked to email them their portal invitation when you save.",
      do: async (h) => h.point(`${form} input[type="checkbox"]`, 1200),
    },
    {
      say: "Click Onboard. The new firm appears in the list.",
      do: async (h) => {
        await h.click(`${form} button:text-is("Onboard")`);
        await h.page.waitForSelector('div.font-semibold:has-text("Northside Example Planners")', { timeout: 15000 });
        await h.point('div.font-semibold:has-text("Northside Example Planners")', 1200);
      },
    },
  ],
};
