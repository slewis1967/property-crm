/**
 * Overview of Deal Analyser: a tour of the page. Nothing is created, changed or deleted. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const ID = "da000000-0000-4000-8000-000000000002";
// Build this packet's reports first, so the tour can show them.
{
  const r = await fetch("http://localhost:3111/api/deal-analyser/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deal_packet_id: ID }),
  });
  if (!r.ok) throw new Error("could not prepare reports: " + (await r.text()));
}

export default {
  start: "/deal-analyser",
  steps: [
    {
      say: "This is the Deal Analyser. It turns a builder's property package into investment reports for a client.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The list has one row for each package a builder has sent, named by its suburbs, with the number of properties and the date.",
      do: async (h) => h.point(`a[href="/deal-analyser/${ID}"] h2`, 1600),
    },
    {
      say: "The tag on the right tells you what each packet is waiting on, such as Needs rent, Ready or Reports generated.",
      do: async (h) => {
        await h.point('span:text-is("Needs rent")', 800);
        await h.point('span:text-is("Reports generated")', 800);
      },
    },
    {
      say: "Open a packet. The top box links it to a client's opportunity, so the reports sit with their record.",
      do: async (h) => {
        await h.click(`a[href="/deal-analyser/${ID}"]`);
        await h.page.waitForURL(`**/deal-analyser/${ID}`);
        await h.page.waitForLoadState("networkidle");
        await h.point('label:text-is("Opportunity")', 1000);
      },
    },
    {
      say: "Under that is a box where you can describe a change in plain words and preview it.",
      do: async (h) => h.point('label:text-is("Changes or extra information")', 1300),
    },
    {
      say: "Each property has its own card with the price, rent, loan and cost figures, and a Research button.",
      do: async (h) => {
        await h.point('h3:has-text("Lot 7 Demo Parade")', 800);
        await h.point('button:has-text("Research") >> nth=0', 800);
      },
    },
    {
      say: "At the bottom are the finished reports to view, and the button that builds them again.",
      do: async (h) => {
        await h.point('h2:text-is("Current reports")', 900);
        await h.point('button:has-text("regenerate")', 900);
      },
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
