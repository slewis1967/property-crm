/** Overview of AUSTRAC Reports: a tour of the page. Changes nothing. Demo data only. */
import { hideVoiceButton, centre } from "./lib/compliance-stock.mjs";

const END = "For step by step help with a task here, pick it from the list under this overview.";
const lodged = 'tr:has-text("TTR-DEMO-000123")';

export default {
  start: "/aml/reports",
  steps: [
    {
      say: "This is AUSTRAC Reports. It is the register of reports the business has to lodge with AUSTRAC.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.page.waitForSelector(lodged);
        await h.pause(400);
      },
    },
    {
      say: "The yellow box is a standing reminder. Never tell a client about a suspicious matter report.",
      do: async (h) => h.point("text=Tipping-off:", 1500),
    },
    {
      say: "New report is where you add a report to the register.",
      do: async (h) => {
        await h.point('h2:has-text("New report")', 600);
        await h.point('label:has-text("Type") select', 600);
        await h.point('button:has-text("Create report")', 600);
      },
    },
    {
      say: "The line under the form shows the deadline for the type and date you have chosen.",
      do: async (h) => h.point("text=Statutory deadline", 1500),
    },
    {
      say: "The list has one row for each report, with its due date and status. Overdue reports show in red.",
      do: async (h) => {
        await centre(h, 'tr:has-text("Lot 77 Heron Quarter")');
        await h.point("main thead", 700);
        await h.point('tr:has-text("Lot 77 Heron Quarter") td >> nth=3', 1200);
      },
    },
    {
      say: "Mark lodged and Delete sit at the end of each row. Once a report is lodged, it shows its reference instead.",
      do: async (h) => {
        await h.point('tr:has-text("Lot 77 Heron Quarter") button:has-text("Mark lodged")', 900);
        await h.point(`${lodged} td >> nth=4`, 1200);
      },
    },
    {
      say: "Suspicious matter reports are hidden from anyone not on the access list, which is kept on Program and Enrolment.",
      do: async (h) => h.point('aside a[href="/aml/program"]', 1500),
    },
    { say: END, do: async (h) => h.pause(600) },
  ],
};
