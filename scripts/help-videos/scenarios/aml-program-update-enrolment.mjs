/** Program and Enrolment: record the AUSTRAC enrolment and the compliance officer. Demo data only. */
import { hideVoiceButton, setDate } from "./lib/compliance-stock.mjs";

const inSection = (title, rest) => `section:has(h2:text-is("${title}")) ${rest}`;

export default {
  start: "/aml/program",
  steps: [
    {
      say: "This video shows how to update the enrolment and compliance officer details.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.pause(400);
      },
    },
    {
      say: "Under AUSTRAC enrolment, choose the enrolment status.",
      do: async (h) => h.select(inSection("AUSTRAC enrolment", "select"), "enrolled"),
    },
    {
      say: "Fill in the AUSTRAC reference and the date you enrolled.",
      do: async (h) => {
        await h.type(inSection("AUSTRAC enrolment", 'label:has-text("AUSTRAC reference") input'), "DEMO-104552");
        await setDate(h, inSection("AUSTRAC enrolment", 'label:has-text("Enrolled on") input'), "2026-07-20");
      },
    },
    {
      say: "Under Compliance officer, fill in their name, email and the date they were appointed.",
      do: async (h) => {
        await h.type(inSection("Compliance officer", 'label:has-text("Name") input'), "Grace Holloway");
        await h.type(inSection("Compliance officer", 'label:has-text("Email") input'), "grace.holloway@example.com");
        await setDate(h, inSection("Compliance officer", 'label:has-text("Appointed on") input'), "2026-06-24");
      },
    },
    {
      say: "Until the officer has been notified to AUSTRAC, the page shows the date that is due by.",
      do: async (h) => h.point("text=Notify AUSTRAC of your compliance officer by", 1500),
    },
    {
      say: "Once that is done, set the date the compliance officer was notified to AUSTRAC.",
      do: async (h) => setDate(h, 'label:has-text("Compliance officer notified to AUSTRAC on") input', "2026-07-28"),
    },
    {
      say: "Click Save program in the bar at the bottom. Nothing is saved until you click it.",
      do: async (h) => {
        await h.click('button:has-text("Save program")');
        await h.page.waitForSelector("text=Program saved.", { timeout: 15000 });
        await h.point("text=Program saved.", 1000);
      },
    },
  ],
};
