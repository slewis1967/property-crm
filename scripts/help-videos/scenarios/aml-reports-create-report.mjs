/** AUSTRAC Reports: add a report record to the register. Demo data only. */
import { hideVoiceButton, waitForApi } from "./lib/compliance-stock.mjs";

const SUBJECT = "Cash deposit, Lot 214 Curlew Rise";

export default {
  start: "/aml/reports",
  steps: [
    {
      say: "This video shows how to add a report to the AUSTRAC reports register.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.point('h2:has-text("New report")', 800);
      },
    },
    {
      say: "Under New report, choose the type. Here we pick a threshold transaction report.",
      do: async (h) => h.select('label:has-text("Type") select', "TTR"),
    },
    {
      say: "Type the subject. This is the party or transaction the report is about.",
      do: async (h) => h.type('input[placeholder="Party / transaction"]', SUBJECT),
    },
    {
      say: "Set the trigger date. It starts on today's date.",
      do: async (h) => h.point('label:has-text("Trigger date") input', 1200),
    },
    {
      say: "If the type is a suspicious matter report, a tick box for terrorism related matters appears here.",
      do: async (h) => h.point('label:has-text("Type") select', 1200),
    },
    {
      say: "Check the due date shown under the form. It changes with the type and the trigger date.",
      do: async (h) => h.point("text=Statutory deadline", 1500),
    },
    {
      say: "Click Create report.",
      do: async (h) => {
        const done = waitForApi(h, "/api/aml/reports", "GET");
        await h.click('button:has-text("Create report")');
        await done.catch(() => {});
      },
    },
    {
      say: "The report now appears in the list below, with its due date.",
      do: async (h) => h.point(`tr:has-text("${SUBJECT}")`, 1500),
    },
  ],
};
