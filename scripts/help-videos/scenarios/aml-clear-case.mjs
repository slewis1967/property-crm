/** CDD Cases: mark a finished case as cleared. Demo data only. */
import { hideVoiceButton, centre } from "./lib/compliance-stock.mjs";

const SECTION = 'section:has(h2:has-text("Sanctions / PEP"))';

export default {
  start: "/aml",
  steps: [
    {
      say: "This video shows how to mark a finished case as cleared.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.page.waitForSelector('a:has-text("Charlotte Walker")');
      },
    },
    {
      say: "Click the party name in the list to open the case.",
      do: async (h) => {
        await h.click('main a:has-text("Charlotte Walker")');
        await h.page.waitForSelector("text=CDD completeness");
      },
    },
    {
      say: "Check that CDD completeness says all required fields are captured. If not, it lists what is missing.",
      do: async (h) => h.point("text=All required fields captured", 1500),
    },
    {
      say: "Check the latest screening result is Clear. The Mark cleared button only appears when both are done.",
      do: async (h) => {
        await centre(h, `${SECTION} h4`);
        await h.point(`${SECTION} ul li >> nth=0`, 1500);
      },
    },
    {
      say: "Click Mark cleared in the bar at the bottom.",
      do: async (h) => {
        await h.click('button:has-text("Mark cleared")');
        await h.page.waitForSelector("text=and locked", { timeout: 15000 });
      },
    },
    {
      say: "The case is now locked and its fields cannot be edited.",
      do: async (h) => {
        await centre(h, "text=and locked");
        await h.point("text=and locked", 1500);
      },
    },
    {
      say: "To change a cleared case later, choose another status in the bottom bar, then click Save. Every change is recorded.",
      do: async (h) => h.point("div.fixed.bottom-0 select", 1800),
    },
  ],
};
