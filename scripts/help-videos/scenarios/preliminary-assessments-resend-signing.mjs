/**
 * Preliminary Assessments: resend the signing links.
 * The demo cannot send email, so the one browser call that resends the links is
 * answered here with a made-up success so the video shows what staff see.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const row = 'tr:has-text("DEMO-4350")';

export default {
  start: "/preliminary-assessments",
  steps: [
    {
      say: "This video shows how to send fresh signing links when a client has lost theirs.",
      do: async (h) => {
        await h.page.route("**/api/preliminary-assessments/*/resend", (route) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ ok: true, sentTo: ["isla.robinson@example.com", "ethan.clarke@example.com"] }),
          }),
        );
        await h.pause(300);
      },
    },
    {
      say: "Find an assessment with the status Sent for signing.",
      do: async (h) => h.point(`${row} td >> nth=4`, 1300),
    },
    {
      say: "Click Resend signing links, then confirm when you are asked.",
      do: async (h) => {
        await h.click(`${row} button:has-text("Resend signing links")`);
        await h.page.waitForSelector(`${row} >> text=New link sent`, { timeout: 10000 });
      },
    },
    {
      say: "New links are emailed to everyone who has not signed yet. Their earlier links stop working.",
      do: async (h) => h.point(`${row} >> text=New link sent`, 1600),
    },
    {
      say: "The button only shows while an assessment is still waiting on signatures.",
      do: async (h) => h.point('tr:has-text("DEMO-4301") td >> nth=4', 1400),
    },
  ],
};
