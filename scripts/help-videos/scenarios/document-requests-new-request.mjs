/**
 * Client Documents: ask a client to upload their documents.
 * The demo cannot send email, so the reply to the one browser call that creates
 * the request is adjusted to say the email went out (the request itself is
 * really created in the demo database). The video then shows what staff see.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const form = 'form:has(h2:has-text("New request"))';

export default {
  start: "/document-requests",
  steps: [
    {
      say: "This video shows how to ask a client to upload their loan documents.",
      do: async (h) => {
        await h.page.route("**/api/document-requests", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          const res = await route.fetch();
          const json = await res.json();
          await route.fulfill({ response: res, json: { ...json, emailed: true, email_error: null } });
        });
        await h.pause(400);
      },
    },
    {
      say: "Under New request, type the client's name in Applicant name. This is required.",
      do: async (h) => h.type(`${form} input[placeholder="e.g. Jane Smith"]`, "Amelia Thompson"),
    },
    {
      say: "Type their email and phone.",
      do: async (h) => {
        await h.type(`${form} input[type="email"]`, "amelia.thompson@example.com");
        await h.type(`${form} input[placeholder="0400 000 000"]`, "0491 570 105");
      },
    },
    {
      say: "Leave the box ticked to email the upload link to the client. Untick it if you want to send the link yourself.",
      do: async (h) => h.point(`${form} input[type="checkbox"]`, 1400),
    },
    {
      say: "Click Create request.",
      do: async (h) => {
        await h.click(`${form} button:has-text("Create request")`);
        await h.page.waitForSelector("text=Request created.", { timeout: 15000 });
      },
    },
    {
      say: "A green box shows the link. Click Copy if you need it. It is shown once only, so if you lose it, create a new request.",
      do: async (h) => h.point(`${form} button:has-text("Copy")`, 1500),
    },
    {
      say: "The new request now appears in the list below, where you can track what comes in.",
      do: async (h) => {
        await h.page.locator('li:has-text("Amelia Thompson")').first().evaluate((el) => el.scrollIntoView({ block: "center" }));
        await h.point('li:has-text("Amelia Thompson") >> nth=0', 1400);
      },
    },
  ],
};
