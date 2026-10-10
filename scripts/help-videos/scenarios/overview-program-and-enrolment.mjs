/** Overview of Program & Enrolment: a tour of the page. Changes nothing. Demo data only. */
import { hideVoiceButton, centre } from "./lib/compliance-stock.mjs";

const END = "For step by step help with a task here, pick it from the list under this overview.";
const head = (title) => `section h2:text-is("${title}")`;

async function show(h, title, hold = 900) {
  await centre(h, head(title));
  await h.point(head(title), hold);
}

export default {
  start: "/aml/program",
  steps: [
    {
      say: "This is Program and Enrolment. It is the record of the anti money laundering program itself.",
      do: async (h) => {
        await hideVoiceButton(h);
        await h.pause(500);
      },
    },
    {
      say: "The yellow box near the top lists anything still outstanding. It disappears when nothing is.",
      do: async (h) => h.point("text=Outstanding program obligations", 1500),
    },
    {
      say: "AUSTRAC enrolment and Compliance officer hold the enrolment details and who the officer is. They feed the status boxes on CDD Cases.",
      do: async (h) => {
        await h.point(head("AUSTRAC enrolment"), 900);
        await h.point(head("Compliance officer"), 900);
      },
    },
    {
      say: "Program approval and Independent evaluation record who approved the program, and when it was last reviewed.",
      do: async (h) => {
        await show(h, "Program approval");
        await show(h, "Independent evaluation");
      },
    },
    {
      say: "AUSTRAC compliance report holds the dates for the regular report about the business.",
      do: async (h) => show(h, "AUSTRAC compliance report", 1300),
    },
    {
      say: "Suspicious Matter Report access lists the extra people who may see those reports.",
      do: async (h) => show(h, "Suspicious Matter Report access", 1300),
    },
    {
      say: "Further down are the Enterprise risk assessment and the Staff training register.",
      do: async (h) => {
        await show(h, "Enterprise risk assessment");
        await show(h, "Staff training register");
      },
    },
    {
      say: "Key dates at the bottom is a reference list of deadlines. Save program, in the bottom bar, keeps your changes.",
      do: async (h) => {
        await show(h, "Key dates");
        await h.point('button:has-text("Save program")', 900);
      },
    },
    { say: END, do: async (h) => h.pause(600) },
  ],
};
