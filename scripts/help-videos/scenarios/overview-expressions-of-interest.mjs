/**
 * Overview of Expressions of Interest: a tour of the page. Nothing is created, changed or deleted. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

export default {
  start: "/eoi",
  steps: [
    {
      say: "This is Expressions of Interest. It is where you prepare the form a buyer signs to put their name on a property.",
      do: async (h) => h.pause(500),
    },
    {
      say: "New EOI, top right, starts a blank one.",
      do: async (h) => h.point('button:has-text("New EOI")', 1100),
    },
    {
      say: "The buttons above the table filter the list by status. Draft, Sent or Signed.",
      do: async (h) => {
        await h.point('button:has-text("Draft (")', 600);
        await h.point('button:has-text("Sent (")', 600);
        await h.point('button:has-text("Signed (")', 600);
      },
    },
    {
      say: "Each row shows the buyer and property, the status, the price, and whether a licence and an identity check are attached.",
      do: async (h) => {
        await h.point('a:has-text("Olivia Bennett")', 900);
        await h.point("thead th >> nth=3", 600);
        await h.point("thead th >> nth=4", 600);
      },
    },
    {
      say: "Open one to see the form. It has sections for the buyers, solicitor, property, deposit and finance.",
      do: async (h) => {
        await h.click('a:has-text("Olivia Bennett")');
        await h.page.waitForSelector('h2:has-text("Buyer/s")');
        await h.page.waitForLoadState("networkidle");
        await h.point('h2:has-text("Buyer/s")', 700);
        await h.point('h2:text-is("Solicitor")', 700);
        await h.point('h2:text-is("Property")', 700);
      },
    },
    {
      say: "Near the bottom is the Electronic signature box, where you send it for signing and see each signer's status.",
      do: async (h) => h.point('h3:has-text("Electronic signature")', 1400),
    },
    {
      say: "The bar at the very bottom holds the status and the Save button.",
      do: async (h) => h.point("div.fixed.bottom-0 select", 1300),
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
