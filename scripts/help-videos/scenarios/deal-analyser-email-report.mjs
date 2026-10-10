/**
 * Deal Analyser: email a finished report to a client, or save it as a PDF.
 * The demo cannot send email, so the one browser call that sends it is answered
 * here with a made-up success so the video shows what staff see.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const ID = "da000000-0000-4000-8000-000000000002";
const PACKETS = [ID];

// Build the reports first, so the packet already has some to work with.
for (const id of PACKETS) {
  const r = await fetch("http://localhost:3111/api/deal-analyser/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deal_packet_id: id }),
  });
  if (!r.ok) throw new Error("could not prepare reports: " + (await r.text()));
}

export default {
  start: "/deal-analyser",
  steps: [
    {
      say: "This video shows how to email a finished report to a client.",
      do: async (h) => {
        await h.page.route("**/api/pia/reports/*/email", (route) =>
          route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }),
        );
        await h.pause(400);
      },
    },
    {
      say: "Click the deal packet in the list.",
      do: async (h) => {
        await h.click(`a[href="/deal-analyser/${ID}"]`);
        await h.page.waitForURL(`**/deal-analyser/${ID}`);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Under Current reports, click View beside the report you want.",
      do: async (h) => {
        await h.click('a:has-text("View →") >> nth=0');
        await h.page.waitForSelector('button:text-is("Email")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click Email, in the toolbar at the top of the report.",
      do: async (h) => h.click('button:text-is("Email")'),
    },
    {
      say: "Type the client's email address. Change the subject and add a short message if you want.",
      do: async (h) => {
        await h.type('input[placeholder="client@email.com"]', "liam.nguyen@example.com");
        await h.type('textarea[placeholder^="Optional message"]', "Hi Liam, here is the comparison we discussed.");
      },
    },
    {
      say: "Click Send. This emails the report to the client straight away, with your signature added.",
      do: async (h) => {
        await h.click('button:text-is("Send")');
        await h.page.waitForSelector("text=Sent to liam.nguyen@example.com", { timeout: 10000 });
        await h.pause(700);
      },
    },
    {
      say: "To save a copy instead, click Export PDF and choose Save as PDF in the print window.",
      do: async (h) => {
        await h.click('button:text-is("Close")');
        await h.point('button:text-is("Export PDF")', 1200);
      },
    },
  ],
};
