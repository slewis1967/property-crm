/**
 * Overview of Contacts: a tour of the list and of one contact's page. Changes nothing.
 * The AI panels on the contact page are answered with made-up text (no AI key in the demo).
 */
import { mockContactAi } from "../lib-crm-b.mjs";

export default {
  start: "/contacts",
  steps: [
    {
      say: "This is Contacts. It lists every person in the CRM, and it is the way in to each person's own page.",
      do: async (h) => {
        await mockContactAi(h.page);
        await h.point("h1", 1200);
      },
    },
    {
      say: "On the left, Contact Types counts people by type. Click one to see only those contacts.",
      do: async (h) => h.point('nav button:has-text("Investor")', 1600),
    },
    {
      say: "The counters at the top show hot, warm and matched totals, and the average lead score.",
      do: async (h) => {
        await h.point("span:has-text('hot') >> nth=0", 800);
        await h.point("span:has-text('avg score')", 800);
      },
    },
    {
      say: "Beside them are the buttons to export the list, import a file, or add a contact.",
      do: async (h) => {
        await h.point('button:has-text("Export CSV")', 700);
        await h.point('button:has-text("Bulk Upload")', 700);
        await h.point('button:has-text("New Contact")', 700);
      },
    },
    {
      say: "Under that, the search box and dropdowns narrow the list and change its order.",
      do: async (h) => {
        await h.point('input[placeholder^="Search name, email"]', 900);
        await h.point('select:has(option[value="hot"])', 800);
      },
    },
    {
      say: "Each row is one person, with their type, budget, state, lead score, status and tags.",
      do: async (h) => h.point('tr:has-text("Olivia Bennett")', 1800),
    },
    {
      say: "Click a row to open that person's page, with buttons along the top, their details on the left, and tabs for activity and notes.",
      do: async (h) => {
        await h.click('p:text-is("Olivia Bennett")');
        await h.page.waitForURL(/\/contacts\/d0000000/);
        await h.page.waitForLoadState("networkidle");
        await h.point('button:text-is("Activity")', 900);
        await h.point('button:text-is("Notes")', 900);
      },
    },
    {
      say: "Pipelines and opportunities shows their deals, which are managed on Opportunities.",
      do: async (h) => h.point('h2:has-text("Pipelines")', 1800),
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
