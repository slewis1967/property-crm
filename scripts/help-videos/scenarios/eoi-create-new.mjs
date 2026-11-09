/**
 * Expressions of Interest: create a new EOI and fill it in. Demo data only.
 * The floating voice assistant button sits on top of the Save button on this
 * page (a CRM layout bug, reported), so it is hidden for the recording.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const field = (label) => `label:has(> span:text-is("${label}")) input`;

export default {
  start: "/eoi",
  steps: [
    {
      say: "This video shows how to create an Expression of Interest for a buyer.",
      do: async (h) => {
        const hide = 'button[aria-label="Open voice assistant"]{display:none !important}';
        await h.page.context().addInitScript((css) => {
          const add = () => {
            const s = document.createElement("style");
            s.textContent = css;
            document.documentElement.appendChild(s);
          };
          if (document.documentElement) add();
          else document.addEventListener("DOMContentLoaded", add);
        }, hide);
        await h.page.addStyleTag({ content: hide });
        await h.pause(400);
      },
    },
    {
      say: "Click New EOI. A blank EOI opens.",
      do: async (h) => {
        await h.click('button:has-text("New EOI")');
        await h.page.waitForURL(/\/eoi\/[0-9a-f-]{36}$/);
        await h.page.waitForSelector('h2:has-text("Buyer/s")');
      },
    },
    {
      say: "Fill in the Buyers section. Click Add buyer if there is more than one buyer.",
      do: async (h) => {
        await h.type('input[placeholder="Full legal name"]', "Amelia Thompson");
        await h.type('input[placeholder="Email"]', "amelia.thompson@example.com");
        await h.type('input[placeholder="Mobile"]', "0491 570 105");
        await h.point('button:has-text("Add buyer")', 500);
      },
    },
    {
      say: "The amber note near the top lists what is still to complete. It shrinks as you fill things in.",
      do: async (h) => h.point("text=Still to complete", 1500),
    },
    {
      say: "Fill in the Solicitor section.",
      do: async (h) => h.type(`section:has(h2:text-is("Solicitor")) ${field("Name")}`, "Example Conveyancing"),
    },
    {
      say: "Then the Property, Deposit and Finance sections. Leave the purchase price blank if it is still to be confirmed.",
      do: async (h) => {
        await h.type(field("Property address"), "Lot 7 Demo Parade, Logan Reserve");
        await h.type(field("Purchase price (blank = TBC)"), "698000");
        await h.type(field("Total deposits (e.g. TBC)"), "TBC");
        await h.click('section:has(h2:text-is("Finance")) button:text-is("Yes")');
      },
    },
    {
      say: "Click Save, in the bar at the bottom of the page.",
      do: async (h) => {
        await h.click('div.fixed.bottom-0 button:has-text("Save")');
        await h.page.waitForSelector("text=Saved.", { timeout: 10000 });
        await h.point("text=Saved.", 900);
      },
    },
  ],
};
