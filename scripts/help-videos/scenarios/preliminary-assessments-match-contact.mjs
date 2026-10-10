/** Preliminary Assessments: match an assessment to its client by hand. Demo data only. */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const row = 'tr:has-text("DEMO-4411")';

export default {
  start: "/preliminary-assessments",
  steps: [
    {
      say: "This video shows how to match a Preliminary Assessment to the right client.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Read the amber note at the top. It tells you how many assessments still need matching.",
      do: async (h) => h.point("text=not matched to a contact yet", 1300),
    },
    {
      say: "Find the assessment, then click Match to a contact in the Contact column.",
      do: async (h) => {
        await h.point(`${row} td >> nth=1`, 600);
        await h.click(`${row} button:has-text("Match to a contact")`);
      },
    },
    {
      say: "Type the client's name, email or phone.",
      do: async (h) => h.type(`${row} input[placeholder="Name, email or phone"]`, "Lucas"),
    },
    {
      say: "Click the right client in the list. Their name now shows in the Contact column.",
      do: async (h) => {
        await h.click(`${row} li button:has-text("Lucas Martin")`);
        await h.page.waitForSelector(`${row} a:has-text("Lucas Martin")`, { timeout: 10000 });
        await h.point(`${row} a:has-text("Lucas Martin")`, 1000);
      },
    },
    {
      say: "If you picked the wrong person, click remove, then match it again.",
      do: async (h) => h.point(`${row} button:has-text("remove")`, 1400),
    },
  ],
};
