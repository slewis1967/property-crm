/**
 * Overview of Partners: a tour of the page. Nothing is created, changed or deleted. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const card = 'div.rounded-xl:has-text("NK-D0007")';

export default {
  start: "/admin/partners",
  steps: [
    {
      say: "This is Partners. It manages the channel partners who sell our stock, and the holds and deals they ask for.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The note at the top explains what partners can see in their portal and how their fee is worked out.",
      do: async (h) => h.point("h1 + p", 1500),
    },
    {
      say: "There are two tabs. Hold requests and deals, and Partner firms.",
      do: async (h) => {
        await h.point('button:has-text("Hold requests")', 700);
        await h.point('button:has-text("Partner firms")', 700);
      },
    },
    {
      say: "Show filters the deals to open ones, requests only, settled, or all.",
      do: async (h) => h.point("select#scope", 1200),
    },
    {
      say: "Each deal card shows the lot, the supplier, the partner and their client, the price and the fee. The stage is at the top right.",
      do: async (h) => {
        await h.point(`${card} div.font-semibold >> nth=0`, 900);
        await h.point(`${card} span.rounded-full >> nth=0`, 900);
      },
    },
    {
      say: "The buttons on a card are what you can do next, such as grant the hold, decline it, or message the partner.",
      do: async (h) => {
        await h.point(`${card} button:text-is("Grant hold")`, 700);
        await h.point(`${card} button:text-is("Message partner")`, 700);
      },
    },
    {
      say: "The Partner firms tab lists each firm with its plan, its client and deal counts, and its logins.",
      do: async (h) => {
        await h.click('button:has-text("Partner firms")');
        await h.point('div.font-semibold:has-text("Bayside Wealth Partners (Demo)")', 1300);
      },
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
