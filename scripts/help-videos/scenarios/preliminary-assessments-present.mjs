/**
 * Preliminary Assessments: read an assessment and open a call to present it.
 * View PDF and Open call each open a new browser tab, so the video points at
 * them without leaving the list.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const row = 'tr:has-text("DEMO-4372")';

export default {
  start: "/preliminary-assessments",
  steps: [
    {
      say: "This video shows how to present a Preliminary Assessment to a client.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Find the client's assessment in the table. It must be matched to a contact first.",
      do: async (h) => {
        await h.point(`${row} td >> nth=1`, 700);
        await h.point(`${row} td >> nth=5`, 900);
      },
    },
    {
      say: "Click View P D F. The assessment opens in a new tab. Read it before the call.",
      do: async (h) => h.point(`${row} a:text-is("View PDF")`, 1800),
    },
    {
      say: "Then click Open call. The client's video room opens in a new tab, where you take them through it.",
      do: async (h) => h.point(`${row} a:text-is("Open call")`, 1800),
    },
    {
      say: "Afterwards, check the Status column. It shows where the assessment is up to.",
      do: async (h) => h.point(`${row} td >> nth=4`, 1500),
    },
  ],
};
