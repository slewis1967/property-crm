/** Introducers: review a referral and accept it. Demo data; NEXUS is the local stand-in, and no email can leave the demo. */
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
      say: "This video shows how to review a referral from an introducer and accept it.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Review queue. Referrals waiting on us are listed under With us.",
      do: async (h) => {
        await h.click('button:has-text("Review queue")');
        await h.point('h2:has-text("With us")', 700);
      },
    },
    {
      say: "Click the referral you want to review.",
      do: async (h) => {
        await h.click('a:has-text("Daniel Sample-Reid")');
        await h.page.waitForURL("**/admin/introducers/submissions/**");
        await h.page.waitForSelector('h2:has-text("Decision")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Read through the client's details.",
      do: async (h) => {
        await h.scroll(260);
        await h.pause(900);
        await h.scroll(-260);
      },
    },
    {
      say: "In the Decision box you can type a message to the introducer. This is optional.",
      do: async (h) =>
        h.type('div:has(> h2:has-text("Decision")) textarea', "Thanks Priya. We will call Daniel this week."),
    },
    {
      say: "Click Accept. This creates the client's opportunity in the pipeline. Only the business owner can do this.",
      do: async (h) => {
        await h.click('button:has-text("Accept")');
        await h.page.waitForSelector('h2:has-text("Decided")', { timeout: 15000 });
      },
    },
    {
      say: "The referral now shows as decided. To refuse one instead, type a reason and click Decline.",
      do: async (h) => h.point('h2:has-text("Decided")', 1500),
    },
  ],
};
