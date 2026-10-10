/** Program and Enrolment: choose who can see Suspicious Matter Reports. Demo data only. */
import { hideVoiceButton, centre } from "./lib/compliance-stock.mjs";

const S = 'section:has(h2:text-is("Suspicious Matter Report access"))';

export default {
  start: "/aml/program",
  steps: [
    {
      say: "This video shows how to choose who can see suspicious matter reports.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.pause(400);
      },
    },
    {
      say: "Scroll down to Suspicious Matter Report access.",
      do: async (h) => {
        await centre(h, S);
        await h.point(`${S} h2`, 1000);
      },
    },
    {
      say: "The compliance officer and the person who created a report can always see it. Anyone else must be listed here.",
      do: async (h) => h.point(`${S} p`, 1500),
    },
    {
      say: "Type the person's email address in the box. To add several at once, paste them in with one email on each line.",
      do: async (h) => h.type(`${S} textarea`, "auditor@example.com"),
    },
    {
      say: "To take someone off the list, delete their line.",
      do: async (h) => h.point(`${S} textarea`, 1200),
    },
    {
      say: "Click Save program. The change does not apply until you save.",
      do: async (h) => {
        await h.click('button:has-text("Save program")');
        await h.page.waitForSelector("text=Program saved.", { timeout: 15000 });
        await h.point("text=Program saved.", 1000);
      },
    },
  ],
};
