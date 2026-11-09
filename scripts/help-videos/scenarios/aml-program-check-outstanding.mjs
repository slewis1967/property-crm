/** Program and Enrolment: see what is outstanding and record it as done. Demo data only. */
import { hideVoiceButton, centre, setDate } from "./lib/compliance-stock.mjs";

const inSection = (title, rest) => `section:has(h2:text-is("${title}")) ${rest}`;

export default {
  start: "/aml/program",
  steps: [
    {
      say: "This video shows how to check what is outstanding on the program.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.pause(400);
      },
    },
    {
      say: "Read the Outstanding program obligations box near the top. It only shows when something is outstanding.",
      do: async (h) => h.point("text=Outstanding program obligations", 1600),
    },
    {
      say: "Check the dates under Program approval and Independent evaluation.",
      do: async (h) => {
        await centre(h, inSection("Program approval", 'label:has-text("Next review due") input'));
        await h.point(inSection("Program approval", 'label:has-text("Next review due") input'), 900);
        await centre(h, inSection("Independent evaluation", 'label:has-text("Next due") input'));
        await h.point(inSection("Independent evaluation", 'label:has-text("Next due") input'), 900);
      },
    },
    {
      say: "Check Due and Lodged under AUSTRAC compliance report.",
      do: async (h) => {
        await centre(h, inSection("AUSTRAC compliance report", "h2"));
        await h.point(inSection("AUSTRAC compliance report", 'label:has-text("Due") input'), 800);
        await h.point(inSection("AUSTRAC compliance report", 'label:has-text("Lodged") input'), 800);
      },
    },
    {
      say: "Fill in any dates and details that are now complete. Here we record an independent evaluation.",
      do: async (h) => {
        await centre(h, inSection("Independent evaluation", "h2"));
        await setDate(h, inSection("Independent evaluation", 'label:has-text("Last completed") input'), "2026-10-02");
        await h.type(inSection("Independent evaluation", 'label:has-text("Evaluator") input'), "Larkspur Assurance");
      },
    },
    {
      say: "Click Save program.",
      do: async (h) => {
        await h.click('button:has-text("Save program")');
        await h.page.waitForSelector("text=Program saved.", { timeout: 15000 });
      },
    },
    {
      say: "The outstanding list at the top updates as you fill things in.",
      do: async (h) => {
        await centre(h, "text=Program saved.");
        await h.point("text=Program saved.", 1500);
      },
    },
  ],
};
