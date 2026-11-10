/** CDD Cases: record a screening result on a case. Demo data only. */
import { hideVoiceButton, centre, waitForApi } from "./lib/compliance-stock.mjs";

const SECTION = 'section:has(h2:has-text("Sanctions / PEP"))';
const row = `${SECTION} div.rounded-lg:has(span:has-text("Liam Nguyen"))`;

export default {
  start: "/aml",
  steps: [
    {
      say: "This video shows how to record a screening result on a customer due diligence case.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.page.waitForSelector('a:has-text("Liam Nguyen")');
      },
    },
    {
      say: "Click the party name in the list to open the case.",
      do: async (h) => {
        await h.click('main a:has-text("Liam Nguyen")');
        await h.page.waitForSelector("text=CDD completeness");
      },
    },
    {
      say: "Scroll down to the screening section. Each party and beneficial owner has its own row.",
      do: async (h) => {
        await centre(h, SECTION);
        await h.point(`${SECTION} h2`, 1200);
      },
    },
    {
      say: "Choose the result in the dropdown on that row. Pick Clear, Potential match or Confirmed match.",
      do: async (h) => h.select(`${row} select`, "clear"),
    },
    {
      say: "Click Record screening. The result cannot be removed afterwards.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aml/screenings?caseId=");
        await h.click(`${row} button:has-text("Record screening")`);
        await done.catch(() => {});
        await h.pause(600);
      },
    },
    {
      say: "The result is added to the screening history underneath, with the date and time.",
      do: async (h) => h.point(`${SECTION} h4:has-text("Screening history")`, 1500),
    },
    {
      say: "Repeat this for every row. A confirmed match changes the case status to Blocked.",
      do: async (h) => h.point(`${row}`, 1200),
    },
  ],
};
