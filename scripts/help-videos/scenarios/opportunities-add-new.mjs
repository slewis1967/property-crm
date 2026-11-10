/** Opportunities: add a new opportunity from an existing contact. Demo data; NEXUS is the local stand-in. */
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

const modal = "div.fixed.inset-0";

export default {
  start: "/opportunities",
  steps: [
    {
      say: "This video shows how to add a new opportunity to the pipeline board.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click New Opportunity, at the top right of the board.",
      do: async (h) => h.click('button:has-text("New Opportunity")'),
    },
    {
      say: "Under Primary Contact, search for the person by name, email or phone, then pick them from the list.",
      do: async (h) => {
        await h.type(`${modal} input[placeholder^="Search by name"]`, "Charlotte");
        await h.click(`${modal} button:has-text("Charlotte Walker")`);
      },
    },
    {
      say: "Their details fill in for you. If the person is new, type their full name and email instead.",
      do: async (h) => {
        await h.point(`${modal} input[placeholder="e.g. Jordan Blake"]`, 700);
        await h.point(`${modal} input[type="email"]`, 700);
      },
    },
    {
      say: "Check the buyer type, state and budget, and choose a timeframe.",
      do: async (h) => {
        await h.point(`${modal} label:has-text("Buyer Type") + select`, 500);
        await h.select(`${modal} label:has-text("Timeframe") + select`, "3-6 months");
      },
    },
    {
      say: "Fill in the preferred buy location. This is required for an owner occupier or first home buyer.",
      do: async (h) => h.type(`${modal} input[placeholder^='e.g. "Brisbane northside"']`, "Brisbane northside"),
    },
    {
      say: "Pick the pipeline and the stage. This decides which column the card lands in.",
      do: async (h) => {
        await h.point(`${modal} label:text-is("Pipeline") + select`, 600);
        await h.point(`${modal} label:has-text("Pipeline Stage") + select`, 600);
      },
    },
    {
      say: "Click Create Opportunity. The new card appears on the board.",
      do: async (h) => {
        await h.click(`${modal} button:has-text("Create Opportunity")`);
        await h.page.waitForSelector(`${modal}`, { state: "detached", timeout: 10000 });
        await h.point('p:has-text("Charlotte Walker")', 1200);
      },
    },
  ],
};
