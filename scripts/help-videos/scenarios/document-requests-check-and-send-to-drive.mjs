/**
 * Client Documents: check what a client has uploaded and send the set to Drive.
 * The demo has no Google Drive, so the one browser call that exports the set is
 * answered here with a made-up success so the video shows what staff see.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const row = (ref) => `ul.space-y-2 > li:has-text("${ref}")`;
const r = row("NK-DEMO-0105");

export default {
  start: "/document-requests",
  steps: [
    {
      say: "This video shows how to check what a client has uploaded, and send the full set to Drive.",
      do: async (h) => {
        await h.page.route("**/api/document-requests/*/export", (route) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ ok: true, uploaded: 7, folder_url: "http://localhost:3111/document-requests" }),
          }),
        );
        await h.pause(300);
      },
    },
    {
      say: "Click the client's name in the list. The row opens and shows every document needed.",
      do: async (h) => {
        await h.click(`${r} > div > button >> nth=0`);
        await h.page.waitForSelector(`${r} >> text=received`, { timeout: 10000 });
        await h.page.locator(r).evaluate((el) => el.scrollIntoView({ block: "start" }));
      },
    },
    {
      say: "Read the count at the top. A green tick means that document is in. Ready to submit means they all are.",
      do: async (h) => h.point(`${r} >> text=received`, 1500),
    },
    {
      say: "If a red failed check tag shows on a row, open it and read the reasons listed.",
      do: async (h) => h.pause(600),
    },
    {
      say: "To remove a wrong file, click Delete beside it. The file is permanently removed, and the client's link will accept a new one.",
      do: async (h) => h.point(`${r} ul li button:text-is("Delete") >> nth=0`, 1500),
    },
    {
      say: "When everything is in, click Send to Drive.",
      do: async (h) => {
        await h.click(`${r} button:text-is("Send to Drive")`);
        await h.page.waitForSelector("text=Exported 7 files to Drive.", { timeout: 10000 });
      },
    },
    {
      say: "A green message confirms it. Click Open Drive folder to check the files.",
      do: async (h) => h.point(`${r} a:has-text("Open Drive folder")`, 1400),
    },
  ],
};
