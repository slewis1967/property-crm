/**
 * Overview of Preliminary Assessments: a tour of the page. Nothing is created, changed or deleted. Demo data only.
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
      say: "This is Preliminary Assessments. It lists the assessments Your Loan Assist sends back, ready to match to a client and present.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The amber note at the top tells you how many are not yet matched to a contact.",
      do: async (h) => h.point("text=matched to a contact yet", 1400),
    },
    {
      say: "The first columns identify each assessment. The reference, the applicants and the property.",
      do: async (h) => {
        await h.point(`${row} td >> nth=0`, 600);
        await h.point(`${row} td >> nth=1`, 600);
        await h.point(`${row} td >> nth=2`, 600);
      },
    },
    {
      say: "Received shows when it arrived, and Status shows where it is up to, from Received through to Signed.",
      do: async (h) => {
        await h.point(`${row} td >> nth=3`, 700);
        await h.point('tr:has-text("DEMO-4350") td >> nth=4', 900);
      },
    },
    {
      say: "Contact shows the client it is matched to. If there is none, a Match to a contact button appears instead.",
      do: async (h) => {
        await h.point(`${row} td >> nth=5`, 800);
        await h.point('button:has-text("Match to a contact") >> nth=0', 900);
      },
    },
    {
      say: "At the end of each row, View P D F opens the assessment and Open call opens the client's video room.",
      do: async (h) => {
        await h.point(`${row} a:text-is("View PDF")`, 900);
        await h.point(`${row} a:text-is("Open call")`, 900);
      },
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
