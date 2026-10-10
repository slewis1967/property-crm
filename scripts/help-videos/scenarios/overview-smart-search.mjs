/**
 * Overview of Smart Search. A tour only; nothing is changed.
 *
 * The search is run by an AI service the demo has no key for, so the browser's
 * call to /api/ai/search is answered here with a made-up result that points at
 * contacts from the demo cast. One search is run so the tour can show results.
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
  ],
};

export default {
  start: "/search",
  steps: [
    {
      say: "This is Smart Search. It finds contacts when you describe them in plain English, instead of setting filters.",
      do: async (h) => {
        await h.page.route("**/api/ai/search", async (route) => {
          await new Promise((r) => setTimeout(r, 1200));
          await route.fulfill({ contentType: "application/json", body: JSON.stringify(RESPONSE) });
        });
        await h.pause(400);
      },
    },
    {
      say: "The search box is where you type who you are looking for, in your own words.",
      do: async (h) => h.point('input[type="text"]', 2000),
    },
    {
      say: "Under it are example searches. Clicking one fills in the box for you.",
      do: async (h) => h.point("div.flex.flex-wrap.gap-2.mt-3", 2000),
    },
    {
      say: "Here is what a search looks like once it has run.",
      do: async (h) => {
        await h.type('input[type="text"]', "investors looking in QLD under $800k");
        await h.click('button:text-is("Search")');
        await h.page.waitForSelector("text=matches from");
      },
    },
    {
      say: "A line above the results shows how many contacts matched, out of those considered.",
      do: async (h) => h.point("text=matches from", 1800),
    },
    {
      say: "The small labels beside it show how your words were understood, such as the state, buyer type and budget.",
      do: async (h) => h.point("span.flex.flex-wrap.gap-1", 2000),
    },
    {
      say: "Each result is a contact's name with a sentence on why they matched. Clicking a name opens that person in Contacts.",
      do: async (h) => {
        await h.point('a[href^="/contacts/"] >> nth=0', 1500);
        await h.point('a[href^="/contacts/"] >> nth=1', 1200);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
