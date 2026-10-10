/**
 * Overview of Client Documents: a tour of the page. Nothing is created, changed or deleted. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const row = (ref) => `ul.space-y-2 > li:has-text("${ref}")`;
const r = row("NK-DEMO-0102");

export default {
  start: "/document-requests",
  steps: [
    {
      say: "This is Client Documents. It sends clients a secure link to upload their loan documents, and tracks what has come in.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The New request form at the top is where you enter the client's details and create their upload link.",
      do: async (h) => {
        await h.point('h2:text-is("New request")', 800);
        await h.point('button:text-is("Create request")', 800);
      },
    },
    {
      say: "Below is one row for each client, with their reference and a status of open, submitted or cancelled.",
      do: async (h) => {
        await h.page.locator(row("NK-DEMO-0101")).evaluate((el) => el.scrollIntoView({ block: "center" }));
        await h.point(`${row("NK-DEMO-0101")} p.font-medium`, 900);
        await h.point(`${row("NK-DEMO-0101")} span:text-is("open")`, 800);
      },
    },
    {
      say: "Click a row to open it. It shows how many documents are in, with a tick beside each one received.",
      do: async (h) => {
        await h.click(`${r} > div > button >> nth=0`);
        await h.page.waitForSelector(`${r} >> text=received`, { timeout: 10000 });
        await h.page.locator(r).evaluate((el) => el.scrollIntoView({ block: "start" }));
        await h.point(`${r} >> text=received`, 1300);
      },
    },
    {
      say: "Send to Drive sends the collected set to the Drive folder.",
      do: async (h) => h.point(`${r} button:text-is("Send to Drive")`, 1200),
    },
    {
      say: "An amber Ready for Y L A box appears once a set is checked and waiting for you to send it.",
      do: async (h) => h.point(`${r} >> text=Ready for YLA`, 1400),
    },
    {
      say: "The last box is where you mark the Preliminary Assessment as received. The assessments are listed on the Preliminary Assessments page.",
      do: async (h) => h.point(`${r} >> text=Preliminary Assessment from YLA`, 1400),
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
