/**
 * Overview of Opportunities: a tour of the page. Nothing is created, changed or deleted. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const card = 'div[draggable="true"]:has(p:text-is("Olivia Bennett"))';

export default {
  start: "/opportunities",
  steps: [
    {
      say: "This is the Opportunities board. It shows every active buyer and the stage each one is up to.",
      do: async (h) => {
        await h.page.route("**/api/ai/diagnose-opportunity", (route) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ ok: true, diagnosis: { stuck: false, diagnosis: "On track. Qualified this week and waiting on a first meeting.", unblock: null } }),
          }),
        );
        await h.pause(500);
      },
    },
    {
      say: "Each pipeline has its own tab at the top, with a count of the buyers in it.",
      do: async (h) => {
        await h.point('button:has-text("Sales Pipeline")', 800);
        await h.point('button:has-text("Investor Pipeline")', 800);
      },
    },
    {
      say: "The toolbar shows how many opportunities are on the board and their total value. On the right are the tag filters, the hidden leads button and New Opportunity.",
      do: async (h) => {
        await h.point("text=/\\d+ opportunities/", 900);
        await h.point('button[title="Show leads marked Do Not Qualify"]', 800);
        await h.point('button:has-text("New Opportunity")', 800);
      },
    },
    {
      say: "Below is one column for each stage, with a count at the top.",
      do: async (h) => {
        await h.point('span:text-is("New Lead")', 700);
        await h.point('span:text-is("Qualified")', 700);
        await h.point('span:text-is("Contacted")', 700);
      },
    },
    {
      say: "Each card is one buyer. It shows their name, how warm they are, their buyer type, state and budget.",
      do: async (h) => h.point(card, 1800),
    },
    {
      say: "Click a card to open the buyer's own page. Along the top are buttons for meetings, tasks and their paperwork.",
      do: async (h) => {
        await h.click(`${card} p:text-is("Olivia Bennett")`);
        await h.page.waitForURL("**/opportunities/opp-1001");
        await h.page.waitForSelector('h2:text-is("Pipeline")');
        await h.page.waitForLoadState("networkidle");
        await h.point('button:has-text("Schedule meeting")', 900);
      },
    },
    {
      say: "Further down are their stage, tags, documents, tasks and notes.",
      do: async (h) => {
        await h.point('h2:text-is("Pipeline")', 600);
        await h.scroll(500);
        await h.pause(700);
      },
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
