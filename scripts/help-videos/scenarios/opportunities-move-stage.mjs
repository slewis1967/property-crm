/**
 * Opportunities: move a card to another stage, by dragging or from the opportunity page.
 * Demo data; NEXUS is the local stand-in.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

// The opportunity page asks an outside AI service for a one line health check.
// The demo has no key for it, so that browser call gets a made-up answer.
const mockDiagnosis = (h) =>
  h.page.route("**/api/ai/diagnose-opportunity", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, diagnosis: { stuck: false, diagnosis: "On track. Qualified this week and waiting on a first meeting.", unblock: null } }),
    }),
  );

const card = (name) => `div[draggable="true"]:has(p:text-is("${name}"))`;
const column = (label) => `div.w-64:has(span:text-is("${label}"))`;

export default {
  start: "/opportunities",
  steps: [
    {
      say: "This video shows how to move an opportunity to another stage.",
      do: async (h) => {
        await mockDiagnosis(h);
        await h.pause(400);
      },
    },
    {
      say: "Each pipeline has its own tab at the top of the board. Click the one you want.",
      do: async (h) => h.click('button:has-text("Sales Pipeline")'),
    },
    {
      say: "Drag the card into the new column. It shows Saving for a moment, then stays in its new stage.",
      do: async (h) => {
        await h.point(card("Noah Patel"), 300);
        const from = await h.page.locator(card("Noah Patel")).boundingBox();
        const to = await h.page.locator(column("Qualified")).boundingBox();
        await h.page.mouse.move(from.x + 60, from.y + 20);
        await h.page.mouse.down();
        await h.page.mouse.move(from.x + 90, from.y + 40, { steps: 6 });
        await h.page.mouse.move(to.x + 120, to.y + 260, { steps: 30 });
        await h.pause(500);
        await h.page.mouse.up();
        await h.page.waitForSelector(`${column("Qualified")} p:text-is("Noah Patel")`, { timeout: 8000 });
        await h.pause(600);
      },
    },
    {
      say: "You can also change the stage from inside the opportunity. Click the card to open it.",
      do: async (h) => {
        await h.click(`${card("Noah Patel")} p:text-is("Noah Patel")`);
        await h.page.waitForURL("**/opportunities/opp-1002");
        await h.page.waitForSelector('h2:text-is("Pipeline")');
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "In the Pipeline box, click the new stage under Stage.",
      do: async (h) => {
        await h.click('div:has(> div > h3:text-is("Stage")) button:text-is("Contacted")');
      },
    },
    {
      say: "A green Saved tick shows when it is done.",
      do: async (h) => h.point('h2:text-is("Pipeline")', 1300),
    },
  ],
};
