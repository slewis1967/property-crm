/**
 * Opportunities: schedule a meeting from an opportunity.
 * The demo cannot send email or create a video room, so the reply to the booking
 * call is adjusted to show the normal result (the meeting is really saved in the
 * demo database). The host names in the list come from the CRM's own settings.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

// The opportunity page asks an outside AI service for a one line health check.
// The demo has no key for it, so that browser call gets a made-up answer.
const mockDiagnosis = (h) =>
  h.page.route("**/api/ai/diagnose-opportunity", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, diagnosis: { stuck: false, diagnosis: "On track. Qualified this week and waiting on a first meeting.", unblock: null } }),
    }),
  );

const modal = "div.fixed.inset-0";

export default {
  start: "/opportunities",
  steps: [
    {
      say: "This video shows how to book a meeting with a buyer from their opportunity.",
      do: async (h) => {
        await mockDiagnosis(h);
        await h.page.route("**/api/appointments", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          const res = await route.fetch();
          const json = await res.json();
          await route.fulfill({
            response: res,
            json: { ...json, invite_sent: true, invite_warning: null, video_link: "http://localhost:3111/meet/demo-olivia-bennett" },
          });
        });
        await h.pause(400);
      },
    },
    {
      say: "Click the buyer's card on the board to open the opportunity.",
      do: async (h) => {
        await h.click('div[draggable="true"] p:text-is("Olivia Bennett")');
        await h.page.waitForURL("**/opportunities/opp-1001");
        await h.page.waitForSelector('button:has-text("Schedule meeting")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click Schedule meeting, in the row of buttons at the top.",
      do: async (h) => h.click('button:has-text("Schedule meeting")'),
    },
    {
      say: "Choose the meeting host, the date, the start time and how long it runs.",
      do: async (h) => {
        await h.point(`${modal} select`, 500);
        await h.point(`${modal} input[type="date"]`, 500);
        await h.point(`${modal} input[type="time"]`, 500);
        await h.click(`${modal} button:text-is("45 min")`);
      },
    },
    {
      say: "Check the attendee email. This is where the invite goes.",
      do: async (h) => h.point(`${modal} input[type="email"]`, 1200),
    },
    {
      say: "Leave Send invite email ticked and the buyer is emailed an invite with a video link. Untick it if you do not want an email sent.",
      do: async (h) => h.point(`${modal} input[type="checkbox"]`, 1500),
    },
    {
      say: "Click Schedule meeting. A message tells you whether the invite was emailed.",
      do: async (h) => {
        await h.click(`${modal} button[type="submit"]`);
        await h.page.waitForSelector("text=Meeting scheduled.", { timeout: 15000 });
        await h.point("text=Meeting scheduled.", 900);
      },
    },
    {
      say: "Then click Close.",
      do: async (h) => h.click(`${modal} button:text-is("Close")`),
    },
  ],
};
