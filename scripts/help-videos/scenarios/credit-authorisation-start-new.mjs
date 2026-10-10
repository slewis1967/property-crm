/** Credit Authorisation: create a new authorisation. Demo data only. */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

export default {
  start: "/credit-authorisation",
  steps: [
    {
      say: "This video shows how to create a Credit Authorisation for a client to sign.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click New authorisation. A blank authorisation opens.",
      do: async (h) => {
        await h.click('button:has-text("New authorisation")');
        await h.page.waitForURL(/\/credit-authorisation\/[0-9a-f-]{36}$/);
        await h.page.waitForSelector('input[placeholder="Name/s"]');
      },
    },
    {
      say: "Type the client's name in the Names box. Put both names for a joint application.",
      do: async (h) => h.type('input[placeholder="Name/s"]', "Amelia Thompson"),
    },
    {
      say: "Type their home address in the Address box.",
      do: async (h) => h.type('input[placeholder="Address"]', "9 Sample Close, North Lakes QLD 4509"),
    },
    {
      say: "The rest of the form is the standard wording the client agrees to. You do not need to change it.",
      do: async (h) => {
        await h.point("ol >> nth=0", 400);
        await h.scroll(400);
        await h.pause(600);
        await h.scroll(-400);
      },
    },
    {
      say: "Your work saves as you go. You can also click Save, at the right of the toolbar at the top.",
      do: async (h) => h.point('button:text-is("Save"), button:text-is("Saving…")', 1200),
    },
  ],
};
