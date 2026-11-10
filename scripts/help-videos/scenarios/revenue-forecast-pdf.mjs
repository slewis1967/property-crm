/**
 * Revenue: print a profit forecast. Adds a real operating cost in the demo
 * database (the seed file removes it). The recorder has no printer, so the
 * Print button is made to do nothing; the print window itself is not shown.
 */
import { stubPrint } from "../lib/command-util.mjs";

export default {
  start: "/revenue",
  steps: [
    {
      say: "This is the Revenue page. Here is how to produce a profit forecast you can save as a PDF.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Forecast at the top right, next to Add deal.",
      do: async (h) => {
        await h.click('a[href="/revenue/forecast"]');
        await h.page.waitForURL(/\/revenue\/forecast/);
        await h.page.waitForSelector("#revenue-forecast");
        await h.pause(600);
      },
    },
    {
      say: "Under Operating costs, type a cost name and its monthly amount.",
      do: async (h) => {
        await h.type('input[placeholder^="e.g. Salaries"]', "Salaries");
        await h.type('input[placeholder="0"]', "12000");
      },
    },
    {
      say: "Click Add. The cost is saved and the forecast below recalculates.",
      do: async (h) => {
        await h.click('button:text-is("Add")');
        await h.pause(900);
      },
    },
    {
      say: "Take care with the small cross beside a cost. It removes that cost straight away.",
      do: async (h) => h.point('button:text-is("×") >> nth=0', 1400),
    },
    {
      say: "Type a name into Prepared for. It prints at the top right of the document.",
      do: async (h) => h.type('input[placeholder^="Prepared for"]', "Example Bank"),
    },
    {
      say: "Click Print or Save as PDF. In the print window, choose Save as PDF, then save.",
      do: async (h) => {
        await stubPrint(h);
        await h.click('button:has-text("Print / Save as PDF")');
      },
    },
    {
      say: "Only the forecast document prints, not the costs editor above it.",
      do: async (h) => {
        await h.point("#revenue-forecast h1", 900);
        await h.scroll(420);
        await h.pause(900);
      },
    },
  ],
};
