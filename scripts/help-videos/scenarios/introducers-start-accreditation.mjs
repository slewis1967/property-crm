/**
 * Introducers: start accrediting a new introducer.
 * The demo cannot send email, so the reply to the call that starts the
 * accreditation is adjusted to say the email went out (the application itself is
 * really created in the demo database).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const form = 'div:has(> h2:text-is("Start an accreditation"))';

export default {
  start: "/admin/introducers",
  steps: [
    {
      say: "This video shows how to invite a new introducer to begin their accreditation.",
      do: async (h) => {
        await h.page.route("**/api/admin/introducers/applications", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          const res = await route.fetch();
          const json = await res.json();
          await route.fulfill({ response: res, json: { ...json, invite_sent: true, invite_error: null } });
        });
        await h.pause(400);
      },
    },
    {
      say: "Click Introducer firms.",
      do: async (h) => h.click('button:text-is("Introducer firms")'),
    },
    {
      say: "Click Start an accreditation. Only the business owner sees this button.",
      do: async (h) => h.click('button:text-is("Start an accreditation")'),
    },
    {
      say: "Type their full legal name and email. The legal name is printed on their certificate and agreement, and they cannot change it.",
      do: async (h) => {
        await h.type(`${form} label:has-text("Full legal name") input`, "Jamie Placeholder");
        await h.type(`${form} label:has-text("Email") input`, "jamie@demo-introducer.example.com");
      },
    },
    {
      say: "Choose the tier and the commercial terms. Get these right now, because they decide which documents are issued.",
      do: async (h) => {
        await h.point(`${form} label:has-text("Tier") select`, 800);
        await h.point(`${form} label:has-text("Commercial terms") select`, 800);
      },
    },
    {
      say: "Click Send and start. This emails the introducer their first step straight away.",
      do: async (h) => {
        await h.click(`${form} button:has-text("Send and start")`);
        await h.page.waitForSelector("text=Accreditation started", { timeout: 15000 });
        await h.point("text=Accreditation started", 1000);
      },
    },
    {
      say: "Click Accreditations to follow their progress.",
      do: async (h) => {
        await h.click('button:text-is("Accreditations")');
        await h.page.waitForLoadState("networkidle");
        await h.pause(1200);
      },
    },
  ],
};
