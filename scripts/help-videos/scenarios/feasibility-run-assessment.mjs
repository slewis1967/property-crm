/**
 * Planning Feasibility: run an assessment.
 *
 * The questions and the report are written by an AI service the demo has no
 * key for, so the browser's calls to /api/ai/planning-feasibility are answered
 * here with a made-up interview and a made-up report for an invented address.
 * No map image is requested (the report carries no location).
 */
import { feasibilityRoute } from "../lib/command-feasibility.mjs";

export default {
  start: "/feasibility",
  steps: [
    {
      say: "This is Planning Feasibility. Here is how to find out what could be built or subdivided on a block.",
      do: async (h) => {
        await feasibilityRoute(h.page);
        await h.pause(400);
      },
    },
    {
      say: "Type the property address.",
      do: async (h) => h.type('input[placeholder^="e.g. 1491"]', "14 Sample Street, Kelso QLD 4815"),
    },
    {
      say: "Describe what the client wants to know. Include anything you already know, such as the zone or the lot size.",
      do: async (h) =>
        h.type("textarea", "Can this block be subdivided, and could the client build a duplex?"),
    },
    {
      say: "Click Start assessment.",
      do: async (h) => {
        await h.click('button:has-text("Start assessment")');
        await h.page.waitForSelector('button:has-text("Generate report now")');
      },
    },
    {
      say: "A few questions appear, already filled in with best guesses. Correct or clear any that are wrong.",
      do: async (h) => {
        await h.point("text=Understanding:", 900);
        const lot = "div.space-y-4 input >> nth=0";
        await h.click(lot);
        await h.page.locator(lot).first().fill("");
        await h.page.locator(lot).first().pressSequentially("1,012 square metres", { delay: 55 });
      },
    },
    {
      say: "Click Continue. You can also click Generate report now to skip any further questions.",
      do: async (h) => {
        await h.point('button:has-text("Generate report now")', 800);
        await h.click('button:text-is("Continue")');
      },
    },
    {
      say: "Wait while the report is prepared. It can take up to a minute.",
      do: async (h) => {
        await h.page.waitForSelector("#feasibility-report", { timeout: 30000 });
      },
    },
    {
      say: "The finished report opens on the NextKey letterhead, ready to save or export.",
      do: async (h) => {
        await h.scroll(420);
        await h.pause(1200);
      },
    },
  ],
};
