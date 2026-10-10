/**
 * Aggregator Feed: open one property and read its details. Demo data only.
 *
 * The "Contacts that fit this property" box is written by an AI service the
 * demo CRM has no key for, so the browser's call to /api/ai/property-matches is
 * answered inside this scenario with made-up matches from the demo cast.
 */
import { centre } from "./lib/compliance-stock.mjs";

const ID = "c5000000-0000-4000-8a00-000000000001";

export default {
  start: "/properties",
  steps: [
    {
      say: "This video shows how to open a property and see its full details.",
      do: async (h) => {
        await h.page.route("**/api/ai/property-matches", (route) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              cached: false,
              matches: [
                { contact_id: "d0000000-0000-4000-8000-000000000001", name: "Olivia Bennett", rationale: "First home buyer looking north of Brisbane with a budget up to $700,000." },
                { contact_id: "d0000000-0000-4000-8000-000000000004", name: "Noah Patel", rationale: "Wants a four bedroom home in Queensland and is close to this price." },
              ],
            }),
          }),
        );
        await h.type('input[placeholder*="Search suburb"]', "Curlew");
        await h.page.waitForSelector(`a[href="/properties/${ID}"]`);
      },
    },
    {
      say: "Find the property in the feed and click Detail on its card.",
      do: async (h) => {
        await centre(h, `a[href="/properties/${ID}"]`);
        await h.click(`a[href="/properties/${ID}"]`);
        await h.page.waitForURL(new RegExp(ID));
        await h.page.waitForSelector("text=Total package");
      },
    },
    {
      say: "Read Total package, Specs and Origin. They show the price breakdown, the sizes, and the builder, estate and lot.",
      do: async (h) => {
        await h.point("text=Total package", 800);
        await centre(h, "p:text-is('Specs')");
        await h.point("p:text-is('Specs')", 800);
        await h.point("p:text-is('Origin')", 800);
      },
    },
    {
      say: "Click Download brochure to open it in a new tab. The button only shows when we hold a brochure.",
      do: async (h) => {
        await centre(h, 'a:has-text("Download brochure")');
        await h.point('a:has-text("Download brochure")', 1400);
      },
    },
    {
      say: "Scroll down to Contacts that fit this property. Click a name to open that contact.",
      do: async (h) => {
        await centre(h, 'h3:has-text("Contacts that fit this property")');
        await h.point('main a:has-text("Olivia Bennett")', 1400);
      },
    },
    {
      say: "At the top, Create EOI starts an expression of interest, and Planning Feasibility checks the site.",
      do: async (h) => {
        await centre(h, 'a:has-text("Create EOI")');
        await h.point('a:has-text("Create EOI")', 900);
        await h.point('a:has-text("Planning Feasibility")', 900);
      },
    },
    {
      say: "To record our fee, type it in Gross developer fee and click Save. Clients never see it.",
      do: async (h) => {
        await h.type('label:has-text("Gross developer fee") input', "24000");
        await h.click('button:text-is("Save")');
        await h.pause(900);
      },
    },
  ],
};
