/**
 * Introducers: suspend or reactivate a firm or one of its logins. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const firm = 'li.rounded-xl:has-text("Harbourline Advisory (Demo)")';

export default {
  start: "/admin/introducers",
  steps: [
    {
      say: "This video shows how to switch off an introducer firm or one of its logins, and how to switch it back on.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Introducer firms, and find the firm in the list.",
      do: async (h) => {
        await h.click('button:text-is("Introducer firms")');
        await h.point(`${firm} span.font-semibold`, 800);
      },
    },
    {
      say: "To suspend one person only, click Suspend beside their email.",
      do: async (h) => {
        await h.click(`${firm} li:has-text("tom@harbourline.example.com") button:text-is("Suspend")`);
        await h.page.waitForSelector(`${firm} li:has-text("tom@harbourline.example.com") button:text-is("Reactivate")`, { timeout: 10000 });
      },
    },
    {
      say: "To suspend the whole firm, click Suspend on the right of the firm. Only the business owner sees this button.",
      do: async (h) => {
        await h.click(`${firm} > div button:text-is("Suspend")`);
        await h.page.waitForSelector(`${firm} > div button:text-is("Reactivate")`, { timeout: 10000 });
      },
    },
    {
      say: "The firm now shows as suspended.",
      do: async (h) => h.point(`${firm} span.rounded-full >> nth=0`, 1200),
    },
    {
      say: "Click Reactivate to switch a firm or a person back on.",
      do: async (h) => {
        await h.click(`${firm} > div button:text-is("Reactivate")`);
        await h.page.waitForSelector(`${firm} > div button:text-is("Suspend")`, { timeout: 10000 });
        await h.pause(600);
      },
    },
  ],
};
