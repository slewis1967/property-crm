/**
 * Smart Search: find contacts by describing them.
 *
 * The search is run by an AI service the demo has no key for, so the browser's
 * call to /api/ai/search is answered here with a made-up result that points at
 * real contacts from the demo cast. The contact page opened at the end is real.
 */
const RESPONSE = {
  ok: true,
  candidate_count: 5,
  filters_applied: { buyer_type: "Investor", state: "QLD", budget_max: 800000 },
  results: [
    {
      contact_id: "d0000000-0000-4000-8000-000000000011",
      name: "Grace Lee",
      rationale: "Investor looking in Queensland with a budget of $640,000 to $700,000. Pre-approved and wants a completed home.",
    },
    {
      contact_id: "d0000000-0000-4000-8000-000000000002",
      name: "Liam Nguyen",
      rationale: "Investor buying in Queensland up to $800,000. Interested in dual occupancy.",
    },
    {
      contact_id: "d0000000-0000-4000-8000-000000000006",
      name: "Jack Harris",
      rationale: "Investor looking in Queensland with a budget of $650,000 to $750,000. Pre-approved.",
    },
    {
      contact_id: "d0000000-0000-4000-8000-000000000003",
      name: "Charlotte Walker",
      rationale: "Investor buying in Queensland up to $650,000. Pre-approved, referred by her accountant.",
    },
  ],
};

export default {
  start: "/search",
  steps: [
    {
      say: "This is Smart Search. Here is how to find contacts by describing who you are looking for.",
      do: async (h) => {
        await h.page.route("**/api/ai/search", async (route) => {
          await new Promise((r) => setTimeout(r, 1400));
          await route.fulfill({ contentType: "application/json", body: JSON.stringify(RESPONSE) });
        });
        await h.pause(400);
      },
    },
    {
      say: "Type what you are looking for in your own words.",
      do: async (h) => h.type('input[type="text"]', "investors looking in QLD under $800k"),
    },
    {
      say: "You can also click one of the examples under the box. That only fills in the box, so you still need to run the search.",
      do: async (h) => h.point('button:has-text("NDIS buyers in NSW")', 1500),
    },
    {
      say: "Click Search. It can take a few seconds.",
      do: async (h) => {
        await h.click('button:text-is("Search")');
        await h.page.waitForSelector("text=matches from");
      },
    },
    {
      say: "Check the small labels above the results. They show how your words were understood.",
      do: async (h) => h.point("span.flex.flex-wrap.gap-1", 1800),
    },
    {
      say: "Read the reason under each name. It explains why that contact matched.",
      do: async (h) => h.point('a[href^="/contacts/"] p >> nth=1', 1800),
    },
    {
      say: "Click a name to open the contact.",
      do: async (h) => {
        await h.click('a[href^="/contacts/"]:has-text("Grace Lee") p >> nth=0');
        await h.page.waitForURL(/\/contacts\//);
        await h.page.waitForLoadState("networkidle");
        await h.pause(1000);
      },
    },
  ],
};
