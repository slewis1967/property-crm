/**
 * Partners: release the lot details to a partner once a hold is confirmed. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const card = 'div.rounded-xl:has-text("NK-D0031")';

export default {
  start: "/admin/partners",
  steps: [
    {
      say: "This video shows how to release a lot's builder, estate and address to a partner.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Hold requests and deals, and find the deal in the list.",
      do: async (h) => {
        await h.click('button:has-text("Hold requests")');
        await h.point(`${card} div.font-semibold >> nth=0`, 800);
      },
    },
    {
      say: "Click Release lot details. This button appears once a hold has been granted.",
      do: async (h) => h.click(`${card} button:text-is("Release lot details")`),
    },
    {
      say: "Check each detail and fix anything that is wrong.",
      do: async (h) => {
        await h.point(`${card} .grid label >> nth=0`, 600);
        await h.point(`${card} .grid label >> nth=3`, 600);
      },
    },
    {
      say: "Read the warning. Only release once the hold is confirmed and the partner's agreement is signed.",
      do: async (h) => h.point(`${card} p.text-amber-800`, 1400),
    },
    {
      say: "Click Confirm. The partner can now see who the supplier is.",
      do: async (h) => {
        await h.click(`${card} button:text-is("Confirm")`);
        await h.page.waitForSelector("text=Lot details released to the partner.", { timeout: 15000 });
        await h.point("text=Lot details released to the partner.", 1000);
      },
    },
  ],
};
