/** Partners: grant a hold request. Demo data only; no message can leave the demo. */
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
      say: "This video shows how to answer a partner who has asked to hold a lot for their client.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Hold requests and deals.",
      do: async (h) => h.click('button:has-text("Hold requests")'),
    },
    {
      say: "Beside Show, choose Requests only. This lists just the requests waiting for an answer.",
      do: async (h) => {
        await h.select("select#scope", "requested");
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Read the request, then click Grant hold.",
      do: async (h) => {
        await h.point(`${card} p:has-text("Partner note")`, 800);
        await h.click(`${card} button:has-text("Grant hold")`);
      },
    },
    {
      say: "Set the Hold until date. Confirm the date with the builder first.",
      do: async (h) => h.point(`${card} input[type="date"]`, 1400),
    },
    {
      say: "Type a message to the partner if you want. If you leave it blank, a standard message is sent.",
      do: async (h) => h.type(`${card} textarea`, "Hold confirmed with the builder. Please send the EOI this week."),
    },
    {
      say: "Click Confirm. A green message tells you the hold was granted.",
      do: async (h) => {
        await h.click(`${card} button:has-text("Confirm")`);
        await h.page.waitForSelector("text=Hold granted.", { timeout: 15000 });
        await h.point("text=Hold granted.", 1000);
      },
    },
    {
      say: "To refuse a request instead, click Decline, type a reason and click Confirm.",
      do: async (h) => h.pause(600),
    },
  ],
};
