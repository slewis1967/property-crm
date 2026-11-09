/** Overview of CDD Cases: a tour of the page. Changes nothing. Demo data only. */
import { hideVoiceButton, centre } from "./lib/compliance-stock.mjs";

const END = "For step by step help with a task here, pick it from the list under this overview.";

export default {
  start: "/aml",
  steps: [
    {
      say: "This is CDD Cases. It holds a customer due diligence record for each buyer and seller.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.page.waitForSelector('main a:has-text("Liam Nguyen")');
        await h.pause(400);
      },
    },
    {
      say: "The buttons at the top right open the other two compliance pages, Program and enrolment, and Reports.",
      do: async (h) => {
        await h.point('main a[href="/aml/program"]', 700);
        await h.point('main a[href="/aml/reports"]', 700);
      },
    },
    {
      say: "These three boxes show where the business stands on enrolment and the compliance officer.",
      do: async (h) => {
        await h.point("text=AUSTRAC enrolment", 600);
        await h.point("main >> text=Compliance officer", 600);
        await h.point("text=Officer notified to AUSTRAC", 600);
      },
    },
    {
      say: "New CDD case is where you pick the party type and start a case.",
      do: async (h) => h.point('button:has-text("Start CDD")', 1300),
    },
    {
      say: "The status buttons narrow the list, and each one shows a count.",
      do: async (h) => {
        await h.point('button:has-text("All (")', 500);
        await h.point('button:has-text("Screening (")', 500);
        await h.point('button:has-text("Blocked (")', 500);
      },
    },
    {
      say: "The list has one row for each party, with their risk, screening result and status. A review due tag marks a case that needs another look.",
      do: async (h) => {
        await h.point("main thead", 1200);
        await h.point("text=review due", 1200);
      },
    },
    {
      say: "Click a party name to open the full record, from identity and source of funds down to screening and the audit trail.",
      do: async (h) => {
        await h.click('main a:has-text("Liam Nguyen")');
        await h.page.waitForSelector("text=CDD completeness");
        await h.point('h2:has-text("CDD completeness")', 800);
        await centre(h, 'h2:has-text("Source of funds")');
        await h.pause(700);
        await centre(h, 'h2:has-text("Sanctions / PEP")');
        await h.pause(700);
      },
    },
    { say: END, do: async (h) => h.pause(600) },
  ],
};
