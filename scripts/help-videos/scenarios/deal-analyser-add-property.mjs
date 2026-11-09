/**
 * Deal Analyser: add a property to a deal packet and rebuild the reports. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const ID = "da000000-0000-4000-8000-000000000003";
const PACKETS = [ID];

// Build the reports first, so the packet already has some to work with.
for (const id of PACKETS) {
  const r = await fetch("http://localhost:3111/api/deal-analyser/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deal_packet_id: id }),
  });
  if (!r.ok) throw new Error("could not prepare reports: " + (await r.text()));
}

const form = 'div:has(> div > h3:text-is("Add a property"))';

export default {
  start: "/deal-analyser",
  steps: [
    {
      say: "This video shows how to add another property to a deal packet, so it is compared with the rest.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click the deal packet in the list.",
      do: async (h) => {
        await h.click(`a[href="/deal-analyser/${ID}"]`);
        await h.page.waitForURL(`**/deal-analyser/${ID}`);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click Add a property, below the last property card.",
      do: async (h) => h.click('button:has-text("Add a property")'),
    },
    {
      say: "Click From stock to pick one of our listed properties. You can search by suburb, address or builder.",
      do: async (h) => {
        await h.click(`${form} button:text-is("From stock")`);
        await h.type(`${form} input[placeholder^="Search your stock"]`, "Yarrabilba");
        await h.pause(900);
      },
    },
    {
      say: "Or stay on Manual entry, fill in the boxes yourself, then click Add property.",
      do: async (h) => {
        await h.click(`${form} button:text-is("Manual entry")`);
        await h.type(`${form} label:has-text("Address") input`, "Lot 31 Example Avenue");
        await h.type(`${form} label:has-text("Suburb") input`, "Yarrabilba");
        await h.type(`${form} label:has-text("Package price") input`, "672000");
        await h.type(`${form} label:has-text("Bedrooms") input`, "4");
        await h.type(`${form} label:has-text("Weekly rent") input`, "610");
        await h.click(`${form} button:text-is("Add property")`);
        await h.page.waitForSelector('h3:has-text("Lot 31 Example Avenue")', { timeout: 15000 });
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "The new property gets its own card. Check its rent and other figures.",
      do: async (h) => h.point('h3:has-text("Lot 31 Example Avenue")', 1300),
    },
    {
      say: "Then click Save changes and regenerate. The reports are rebuilt with the new property included.",
      do: async (h) => {
        await h.click('button:has-text("regenerate"), button:has-text("Generate reports")');
        await h.page.waitForSelector('a:has-text("Yarrabilba")', { timeout: 30000 });
        await h.page.waitForLoadState("networkidle");
        await h.point('h2:text-is("Current reports")', 1200);
      },
    },
  ],
};
