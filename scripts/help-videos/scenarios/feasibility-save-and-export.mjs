/**
 * Planning Feasibility: save a finished report and export it as a PDF.
 *
 * The report is written by an AI service the demo has no key for, so the
 * browser's calls to /api/ai/planning-feasibility are answered with a made-up
 * report for an invented address (see lib/command-feasibility.mjs). Saving it
 * is real (the seed file removes it). The recorder has no printer, so Export
 * PDF is made to do nothing; the print window itself is not shown.
 */
import { feasibilityRoute } from "../lib/command-feasibility.mjs";
import { stubPrint } from "../lib/command-util.mjs";

export default {
  start: "/feasibility",
  steps: [
    {
      say: "This is a finished Planning Feasibility report. Here is how to save it and export it as a PDF.",
      do: async (h) => {
        // Get a finished report on screen quickly; running an assessment has its own video.
        await feasibilityRoute(h.page, { fast: true });
        await h.page.locator('input[placeholder^="e.g. 1491"]').fill("14 Sample Street, Kelso QLD 4815");
        await h.page.locator("textarea").fill("Can this block be subdivided, and could the client build a duplex?");
        await h.page.locator('button:has-text("Start assessment")').click();
        await h.page.locator('button:has-text("Generate report now")').click();
        await h.page.waitForSelector("#feasibility-report");
      },
    },
    {
      say: "Click Save to CRM in the bar above the report.",
      do: async (h) => {
        await h.click('button:has-text("Save to CRM")');
        await h.page.waitForSelector('button:has-text("Saved")');
      },
    },
    {
      say: "The button changes to Saved, so you know the report is kept.",
      do: async (h) => h.point('button:has-text("Saved")', 1400),
    },
    {
      say: "Click Export PDF. In the print window, choose Save as PDF, then save.",
      do: async (h) => {
        await stubPrint(h);
        await h.click('button:has-text("Export PDF")');
      },
    },
    {
      say: "Only the report prints, on the NextKey letterhead.",
      do: async (h) => {
        await h.scroll(380);
        await h.pause(1000);
        await h.scroll(-380);
      },
    },
    {
      say: "Click New assessment to start another. Save first, because a report you have not saved is lost when you do this.",
      do: async (h) => {
        await h.click('button:has-text("New assessment")');
        await h.page.waitForSelector('h2:has-text("Saved reports")');
      },
    },
    {
      say: "Your saved report now appears under Saved reports on the first screen.",
      do: async (h) => h.point('p:has-text("14 Sample Street, Kelso QLD 4815")', 1600),
    },
  ],
};
