/**
 * Client Documents: release a checked application to Your Loan Assist.
 * Sending goes through an outside email service the demo has no key for, so the
 * one browser call that sends it is answered here with a made-up success.
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
      say: "This video shows how to send a finished application to Your Loan Assist.",
      do: async (h) => {
        await h.page.route("**/api/document-requests/*/submit-to-yla", (route) =>
          route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, submitted: true }) }),
        );
        await h.pause(300);
      },
    },
    {
      say: "Click the client's name in the list.",
      do: async (h) => {
        await h.click(`${r} > div > button >> nth=0`);
        await h.page.waitForSelector(`${r} >> text=Ready for YLA`, { timeout: 10000 });
        await h.page.locator(`${r} >> text=Ready for YLA`).evaluate((el) => el.scrollIntoView({ block: "center" }));
      },
    },
    {
      say: "Find the amber box that says Ready for Y L A, held for your check. It only shows once the set is verified and in Drive.",
      do: async (h) => h.point(`${r} >> text=Ready for YLA`, 1500),
    },
    {
      say: "Click Check the Drive folder and look through the files before you send.",
      do: async (h) => h.point(`${r} a:has-text("Check the Drive folder")`, 1500),
    },
    {
      say: "Then click Send to Y L A and confirm. This emails Your Loan Assist straight away and cannot be unsent.",
      do: async (h) => {
        await h.click(`${r} button:text-is("Send to YLA")`);
        await h.page.waitForSelector("text=Sent to YLA.", { timeout: 10000 });
        await h.point("text=Sent to YLA.", 900);
      },
    },
    {
      say: "When the assessment comes back from them, click Mark P A received.",
      do: async (h) => {
        await h.click(`${r} button:text-is("Mark PA received")`);
        await h.page.waitForSelector(`${r} button:text-is("Mark not received")`, { timeout: 10000 });
        await h.pause(700);
      },
    },
  ],
};
