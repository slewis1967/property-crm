/**
 * Overview of Lead Intake: a tour of the page. Nothing is created, changed or deleted. Demo data only.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
execSync("docker exec -i supabase_db_crm-help-studio psql -U postgres -q -v ON_ERROR_STOP=1", {
  input: fs.readFileSync(new URL("../seed/10-crm-a.sql", import.meta.url)),
});
await fetch("http://127.0.0.1:8799/__crm-a/reset", { method: "POST" });

export default {
  start: "/leads",
  steps: [
    {
      say: "This is Lead Intake, the inbox for new enquiries. Here you decide which leads move into the working pipeline.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The three counters show how many leads are waiting to be triaged, how many have a property match, and how many are already promoted.",
      do: async (h) => {
        await h.point('p:text-is("To triage")', 700);
        await h.point('p:text-is("Matched")', 700);
        await h.point('p:text-is("Promoted")', 700);
      },
    },
    {
      say: "These two buttons switch between the leads still waiting and every lead received.",
      do: async (h) => {
        await h.point('button:text-is("To triage")', 700);
        await h.point('button:text-is("All leads")', 700);
      },
    },
    {
      say: "Promote into chooses which pipeline a lead goes to.",
      do: async (h) => h.point('label:has-text("Promote into") select', 1300),
    },
    {
      say: "The table has one row for each enquiry, with their details, a score, and the best matching property.",
      do: async (h) => {
        await h.point("tbody tr >> nth=0", 900);
        await h.point("thead th >> nth=5", 600);
        await h.point("thead th >> nth=7", 600);
      },
    },
    {
      say: "At the end of each row is the Promote button. It sends the lead to the Opportunities board.",
      do: async (h) => {
        await h.page.locator(".overflow-x-auto").first().evaluate((el) => (el.scrollLeft = el.scrollWidth));
        await h.point('button:has-text("Promote") >> nth=0', 1300);
      },
    },
    {
      say: "The Working pipeline button, top right, takes you to that board.",
      do: async (h) => h.point('a:has-text("Working pipeline")', 1200),
    },
    { say: "For step by step help with a task here, pick it from the list under this overview.", do: async (h) => h.pause(400) },
  ],
};
