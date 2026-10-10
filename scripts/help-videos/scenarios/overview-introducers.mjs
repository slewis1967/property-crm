/**
 * Overview of Introducers: a tour of the page. Nothing is created, changed or deleted. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

export default {
  start: "/admin/introducers",
  steps: [
    {
      say: "This is Introducers. It manages the outside firms who refer clients to us, and the referrals they send.",
      do: async (h) => h.pause(500),
    },
    {
      say: "There are three tabs. Review queue, Accreditations and Introducer firms.",
      do: async (h) => {
        await h.point('button:has-text("Review queue")', 600);
        await h.point('button:text-is("Accreditations")', 600);
        await h.point('button:text-is("Introducer firms")', 600);
      },
    },
    {
      say: "The review queue groups referrals under With us, and Waiting on the introducer.",
      do: async (h) => {
        await h.point('h2:has-text("With us")', 800);
        await h.point('h2:has-text("Waiting on the introducer")', 800);
      },
    },
    {
      say: "Open a referral to see the client's details. On the right are boxes to update progress, ask for more, and accept or decline. An accepted referral becomes a card on Opportunities.",
      do: async (h) => {
        await h.click('a:has-text("Daniel Sample-Reid")');
        await h.page.waitForSelector('h2:text-is("Progress")');
        await h.page.waitForLoadState("networkidle");
        await h.point('h2:text-is("Progress")', 700);
        await h.point('h2:text-is("Ask for more")', 700);
        await h.point('h2:text-is("Decision")', 900);
      },
    },
    {
      say: "The Accreditations tab lists new introducers working through their sign up steps.",
      do: async (h) => {
        await h.goto("/admin/introducers");
        await h.click('button:text-is("Accreditations")');
        await h.page.waitForLoadState("networkidle");
        await h.pause(900);
      },
    },
    {
      say: "Introducer firms shows each firm with its contact, its referral count and its logins.",
      do: async (h) => {
        await h.click('button:text-is("Introducer firms")');
        await h.point('li.rounded-xl:has-text("Harbourline Advisory (Demo)") span.font-semibold', 1300);
      },
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
