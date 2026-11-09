/**
 * Deal Analyser: supply a missing rent and generate the reports.
 * The Research button normally searches the web through an outside service,
 * which the demo has no key for, so that one browser call is answered here with
 * made-up figures so the video shows what staff see.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const ID = "da000000-0000-4000-8000-000000000001";

export default {
  start: "/deal-analyser",
  steps: [
    {
      say: "This video shows how to turn a builder's property package into client reports.",
      do: async (h) => {
        await h.page.route("**/api/deal-analyser/research", (route) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              figures: { interestRate: 6.3, stampDuty: 15925, rates: 2100, insurance: 1650 },
              sources: [
                { field: "interestRate", label: "Interest rate", value: 6.3, source: "Demo rate survey", date: "Oct 2026" },
                { field: "stampDuty", label: "Stamp duty", value: 15925, source: "Demo duty calculator", date: "Oct 2026" },
                { field: "rates", label: "Council rates", value: 2100, source: "Demo council schedule", date: "Oct 2026" },
                { field: "insurance", label: "Landlord insurance", value: 1650, source: "Demo insurer quote", date: "Oct 2026" },
              ],
            }),
          }),
        );
        await h.pause(400);
      },
    },
    {
      say: "Click a deal packet in the list. One marked Needs rent is waiting on you.",
      do: async (h) => {
        await h.click(`a[href="/deal-analyser/${ID}"]`);
        await h.page.waitForURL(`**/deal-analyser/${ID}`);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Check the weekly rent on each property. The box may show an estimate, so type over it with the real figure.",
      do: async (h) => {
        const box = 'label:has-text("Weekly rent") input >> nth=0';
        await h.click(box);
        await h.page.keyboard.press("Control+A");
        await h.page.locator(box).pressSequentially("650", { delay: 90 });
        await h.pause(300);
      },
    },
    {
      say: "Click Research. It looks up the interest rate, stamp duty, council rates and insurance for you.",
      do: async (h) => {
        await h.click('button:has-text("Research") >> nth=0');
        await h.page.waitForSelector("text=Sourced:", { timeout: 10000 });
      },
    },
    {
      say: "Check the other figures and fix any that are wrong. Click Advanced to see more of them.",
      do: async (h) => {
        await h.click('button:has-text("Advanced") >> nth=0');
        await h.pause(900);
      },
    },
    {
      say: "Then click Generate reports, at the bottom of the page.",
      do: async (h) => {
        await h.click('button:has-text("Generate reports")');
        await h.page.waitForSelector("text=Current reports", { timeout: 30000 });
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "The finished reports are listed under Current reports. Click View to open one.",
      do: async (h) => {
        await h.click('a:has-text("View →") >> nth=0');
        await h.page.waitForLoadState("networkidle");
        await h.pause(1200);
      },
    },
  ],
};
