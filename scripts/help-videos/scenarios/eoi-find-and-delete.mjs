/**
 * Expressions of Interest: filter the list and delete an EOI made by mistake. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

export default {
  start: "/eoi",
  steps: [
    {
      say: "This video shows how to find an Expression of Interest, and how to delete one made by mistake.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Draft, Sent or Signed above the table to see only those.",
      do: async (h) => {
        await h.click('button:has-text("Signed (")');
        await h.pause(600);
        await h.click('button:has-text("Draft (")');
      },
    },
    {
      say: "Click All to see everything again.",
      do: async (h) => h.click('button:has-text("All (")'),
    },
    {
      say: "Click the buyer or property name to open an EOI.",
      do: async (h) => h.point('a:has-text("Mia Anderson")', 1200),
    },
    {
      say: "To remove one, click Delete at the end of its row, then confirm when you are asked.",
      do: async (h) => {
        await h.click('tr:has-text("Sample Duplicate") button:text-is("Delete")');
        await h.page.waitForSelector('tr:has-text("Sample Duplicate")', { state: "detached", timeout: 10000 });
      },
    },
    {
      say: "The EOI is gone from the list. This cannot be undone.",
      do: async (h) => h.pause(900),
    },
  ],
};
