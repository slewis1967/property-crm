/**
 * PIA Modeller: save a report, then print it. Saves a real report in the demo
 * database (the seed file removes it). The recorder has no printer, so the
 * Print button is made to do nothing; the print window itself is not shown.
 */
import { replace, stubPrint } from "../lib/command-util.mjs";

const field = (label) => `label:has(> span:has-text("${label}")) input`;

export default {
  // Opened the way it is from a contact and a property, so the report is linked.
  start: "/pia?contact=d0000000-0000-4000-8000-000000000011&property=c0aa0000-0000-4000-8000-000000000103",
  steps: [
    {
      say: "This is the PIA Modeller. Here is how to save a report in the CRM, or print it for a meeting.",
      do: async (h) => h.pause(500),
    },
    {
      say: "First set up the scenario the way you want it.",
      do: async (h) => replace(h, field("Loan amount"), "579200"),
    },
    {
      say: "Click Save report in the bar at the top.",
      do: async (h) => {
        await h.click('button:has-text("Save report")');
        await h.page.waitForSelector('button:has-text("Re-save")');
      },
    },
    {
      say: "A green Saved message appears under the buttons.",
      do: async (h) => h.point("p.text-green-700", 1400),
    },
    {
      say: "Check the Linked to line on the left. It shows the contact and property the report is saved against.",
      do: async (h) => h.point("text=Linked to", 1800),
    },
    {
      say: "To print, click Print. Then choose your printer, or Save as PDF.",
      do: async (h) => {
        await stubPrint(h);
        await h.click('button:text-is("Print")');
      },
    },
    {
      say: "Only the results on the right are printed, not the input boxes.",
      do: async (h) => h.point('p:has-text("Cash needed at start")', 1600),
    },
  ],
};
