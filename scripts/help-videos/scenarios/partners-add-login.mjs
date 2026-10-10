/**
 * Partners: add another login for a partner firm. Demo data only; no email can leave the demo.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const firm = 'div.rounded-xl:has(> div div.font-semibold:has-text("Example Mortgage Group"))';

export default {
  start: "/admin/partners",
  steps: [
    {
      say: "This video shows how to give a second person at a partner firm their own portal login.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Partner firms.",
      do: async (h) => h.click('button:has-text("Partner firms")'),
    },
    {
      say: "Find the firm and click Plan and branding.",
      do: async (h) => h.click(`${firm} button:has-text("Plan & branding")`),
    },
    {
      say: "At the bottom of the panel is Add a login. It shows how many logins the firm has used.",
      do: async (h) => h.point(`${firm} div:has-text("Add a login") >> nth=-1`, 1300),
    },
    {
      say: "Type the person's email and full name.",
      do: async (h) => {
        await h.type(`${firm} input[placeholder="email"]`, "pat@examplemortgage.example.com");
        await h.type(`${firm} input[placeholder="full name"]`, "Pat Sample");
      },
    },
    {
      say: "Click Add and invite. This emails the person their invitation straight away.",
      do: async (h) => {
        await h.click(`${firm} button:has-text("Add & invite")`);
        await h.page.waitForSelector(`${firm} li:has-text("pat@examplemortgage.example.com")`, { timeout: 15000 });
        await h.point(`${firm} li:has-text("pat@examplemortgage.example.com")`, 1200);
      },
    },
  ],
};
